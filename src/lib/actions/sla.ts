"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { applyStatusPauseFlagChange, readSlaCalendar } from "@/lib/sla-store";
import { SLA_SETTING_KEYS, formatTimeOfDay, parseTimeOfDay } from "@/lib/sla";

/**
 * Réglages des engagements de délai : Paramètres > SLA.
 *
 * Trois choses s'y décident, et elles vivent dans trois tables différentes —
 * d'où une action par sujet plutôt qu'un gros formulaire :
 *   — le CALENDRIER de décompte, dans les réglages globaux ;
 *   — les DÉLAIS, sur chaque priorité ;
 *   — les statuts qui SUSPENDENT l'horloge, sur chaque statut.
 */

/** Tout ce qu'affiche l'écran, en une lecture. */
export async function getSlaSettings() {
  await requirePermission("settings.tickets");

  const [calendar, priorities, statuses] = await Promise.all([
    readSlaCalendar(),
    prisma.ticketPriority.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        firstResponseMinutes: true,
        resolutionMinutes: true,
      },
    }),
    prisma.ticketStatus.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, isClosed: true, pausesSla: true },
    }),
  ]);

  return { calendar, priorities, statuses };
}

export type SlaSettings = Awaited<ReturnType<typeof getSlaSettings>>;

const calendarSchema = z
  .object({
    mode: z.enum(["calendar", "business"]),
    /** Jours ISO : 1 = lundi … 7 = dimanche. */
    days: z.array(z.number().int().min(1).max(7)),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((value, ctx) => {
    const start = parseTimeOfDay(value.start);
    const end = parseTimeOfDay(value.end);

    if (start === null || end === null) {
      ctx.addIssue({ code: "custom", message: "Horaires attendus au format HH:MM." });
      return;
    }
    // Refusé plutôt que rattrapé silencieusement : un calendrier sans fenêtre
    // ouverte ne permet à aucune échéance d'exister. Le calcul retomberait sur
    // un décompte 24 h/24 sans que personne ne comprenne pourquoi.
    if (end <= start) {
      ctx.addIssue({ code: "custom", message: "La fermeture doit suivre l'ouverture." });
    }
    if (value.mode === "business" && value.days.length === 0) {
      ctx.addIssue({ code: "custom", message: "Choisissez au moins un jour ouvré." });
    }
  });

export async function updateSlaCalendar(input: z.infer<typeof calendarSchema>) {
  await requirePermission("settings.tickets");
  const data = calendarSchema.parse(input);

  const days = [...new Set(data.days)].sort((a, b) => a - b);
  const values: Record<string, string> = {
    [SLA_SETTING_KEYS.clockMode]: data.mode,
    [SLA_SETTING_KEYS.businessDays]: days.join(","),
    [SLA_SETTING_KEYS.businessStart]: formatTimeOfDay(parseTimeOfDay(data.start) ?? 0),
    [SLA_SETTING_KEYS.businessEnd]: formatTimeOfDay(parseTimeOfDay(data.end) ?? 0),
  };

  // `upsert` et non `update` : ces lignes sont créées par la migration, mais une
  // base restaurée depuis un export antérieur ne les aurait pas, et le
  // formulaire échouerait sans rien dire d'utile.
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.globalSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value, label: key, description: null },
      })
    )
  );

  revalidatePath("/settings/sla");
  revalidatePath("/tickets");
}

/**
 * Champ vide = aucun engagement à ce niveau de priorité, et non « zéro
 * minute » : c'est la seule façon de dire « on ne s'engage pas là-dessus », et
 * elle doit rester atteignable une fois un délai saisi.
 */
const targetsSchema = z.object({
  firstResponseMinutes: z.number().int().positive().max(60 * 24 * 365).nullable(),
  resolutionMinutes: z.number().int().positive().max(60 * 24 * 365).nullable(),
});

export async function updateSlaTargets(
  priorityId: string,
  input: z.infer<typeof targetsSchema>
) {
  await requirePermission("settings.tickets");
  const data = targetsSchema.parse(input);

  await prisma.ticketPriority.update({ where: { id: priorityId }, data });

  // Les tickets DÉJÀ en base gardent leurs échéances : un engagement se prend
  // pour l'avenir. Rejouer le nouveau délai sur l'existant ferait apparaître (ou
  // disparaître) d'un coup des retards sur des dossiers ouverts sous une autre
  // règle, et personne ne saurait plus ce que la file raconte.
  revalidatePath("/settings/sla");
  revalidatePath("/tickets");
}

export async function updateStatusPausesSla(statusId: string, pausesSla: boolean) {
  await requirePermission("settings.tickets");
  await prisma.ticketStatus.update({ where: { id: statusId }, data: { pausesSla } });

  // Le réglage vaut aussi pour les tickets qui portent DÉJÀ ce statut : voir
  // `applyStatusPauseFlagChange`. Décocher la case sans cela laisserait les
  // dossiers en cours suspendus indéfiniment.
  await applyStatusPauseFlagChange({ statusId, pausesSla });

  revalidatePath("/settings/sla");
  revalidatePath("/settings/statuses");
  revalidatePath("/tickets");
}
