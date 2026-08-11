/**
 * Le SLA côté base : lecture des réglages, et les quelques écritures qui font
 * avancer l'horloge d'un ticket.
 *
 * Séparé de `sla.ts` (le calcul, pur) parce que la file de tickets est un
 * composant client : elle importe le calcul pour réafficher le temps restant
 * sans aller-retour serveur, et n'a rien à faire de Prisma.
 *
 * Toutes les fonctions d'écriture sont sans exception (`try`/`catch` ou requête
 * conditionnelle) : elles sont appelées en marge de gestes qui, eux, doivent
 * aboutir — répondre au client, changer un statut, encaisser un email entrant.
 * Une horloge qui ne se met pas à jour est un défaut d'affichage ; une réponse
 * perdue est un client sans réponse.
 */

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SLA_CALENDAR,
  DEFAULT_SLA_WARNING_MINUTES,
  SLA_SETTING_KEYS,
  addSlaDuration,
  computeSlaDueDates,
  parseSlaCalendar,
  parseSlaWarningMinutes,
  slaDurationBetween,
  type SlaCalendar,
  type SlaDueDates,
} from "@/lib/sla";

const TIMEZONE_KEY = "timezone";

const NO_DUE_DATES: SlaDueDates = { firstResponseDueAt: null, resolutionDueAt: null };

/** Calendrier de décompte configuré dans Paramètres > SLA. */
export async function readSlaCalendar(): Promise<SlaCalendar> {
  try {
    const rows = await prisma.globalSetting.findMany({
      where: { key: { in: [...Object.values(SLA_SETTING_KEYS), TIMEZONE_KEY] } },
      select: { key: true, value: true },
    });
    return parseSlaCalendar(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch {
    return DEFAULT_SLA_CALENDAR;
  }
}

/** Combien de minutes avant l'échéance l'email d'alerte part. 0 = pas d'alerte. */
export async function readSlaWarningMinutes(): Promise<number> {
  try {
    const row = await prisma.globalSetting.findUnique({
      where: { key: SLA_SETTING_KEYS.warningMinutes },
      select: { value: true },
    });
    return parseSlaWarningMinutes(row?.value);
  } catch {
    return DEFAULT_SLA_WARNING_MINUTES;
  }
}

/**
 * Échéances à écrire sur un ticket qui arrive, à fusionner dans son `data` de
 * création — un seul aller en base au lieu d'une création suivie d'une mise à
 * jour, et surtout aucune fenêtre pendant laquelle le ticket existe sans
 * horloge.
 *
 * Renvoie deux `null` si la priorité ne porte aucun engagement : c'est le cas
 * tant qu'un administrateur n'a rien saisi dans Paramètres > SLA.
 */
export async function slaDueDatesForNewTicket(
  priorityId: string,
  from: Date = new Date()
): Promise<SlaDueDates> {
  try {
    const [priority, calendar] = await Promise.all([
      prisma.ticketPriority.findUnique({
        where: { id: priorityId },
        select: { firstResponseMinutes: true, resolutionMinutes: true },
      }),
      readSlaCalendar(),
    ]);
    if (!priority) return NO_DUE_DATES;

    return computeSlaDueDates({ from, targets: priority, calendar });
  } catch {
    return NO_DUE_DATES;
  }
}

/**
 * Rejoue les échéances après un changement de priorité.
 *
 * Recalculées depuis la date d'ARRIVÉE du ticket, et non depuis maintenant :
 * l'engagement porte sur l'attente du client, qui a commencé quand il a écrit.
 * Passer un ticket de trois jours en « Urgent (2 h) » le déclare donc en retard
 * sur-le-champ, ce qui est exact — et c'est bien pour ça qu'on le passe urgent.
 *
 * Le temps déjà gelé par des suspensions est réappliqué : sans lui, un
 * changement de priorité rendrait à l'équipe un week-end d'attente client.
 */
export async function recomputeSlaAfterPriorityChange(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        createdAt: true,
        slaPausedMs: true,
        priority: { select: { firstResponseMinutes: true, resolutionMinutes: true } },
      },
    });
    if (!ticket) return;

    const due = computeSlaDueDates({
      from: ticket.createdAt,
      targets: ticket.priority,
      calendar: await readSlaCalendar(),
      alreadyPausedMs: ticket.slaPausedMs,
    });

    // Alertes réarmées avec les échéances : ce sont de nouvelles dates, et le
    // « plus que 30 minutes » déjà envoyé ne parlait pas de celles-là.
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { ...due, firstResponseWarnedAt: null, resolutionWarnedAt: null },
    });
  } catch (error) {
    console.error(`[sla] recalcul impossible sur le ticket ${ticketId}`, error);
  }
}

/**
 * Champs d'horloge à joindre à un changement de statut : suspension à l'entrée
 * d'un statut marqué `pausesSla`, reprise à la sortie.
 *
 * Renvoyé plutôt qu'écrit, pour que la pause parte dans le MÊME `update` que le
 * statut qui la provoque : deux écritures séparées laisseraient une fenêtre
 * pendant laquelle le ticket est « en attente du client » avec une horloge qui
 * tourne encore.
 *
 * À la reprise, les échéances sont repoussées de la durée décomptée de la
 * suspension — en heures ouvrées, une pause du vendredi soir au lundi matin ne
 * repousse donc rien.
 */
export async function slaFieldsForStatusChange({
  ticketId,
  nextStatusId,
  now = new Date(),
}: {
  ticketId: string;
  nextStatusId: string;
  now?: Date;
}): Promise<{
  slaPausedAt?: Date | null;
  slaPausedMs?: number;
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstResponseWarnedAt?: Date | null;
  resolutionWarnedAt?: Date | null;
}> {
  try {
    const [ticket, nextStatus] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          slaPausedAt: true,
          slaPausedMs: true,
          firstResponseDueAt: true,
          resolutionDueAt: true,
          statusId: true,
        },
      }),
      prisma.ticketStatus.findUnique({
        where: { id: nextStatusId },
        select: { pausesSla: true },
      }),
    ]);
    if (!ticket || !nextStatus || ticket.statusId === nextStatusId) return {};

    const isPaused = ticket.slaPausedAt !== null;
    if (nextStatus.pausesSla === isPaused) return {};

    if (nextStatus.pausesSla) return { slaPausedAt: now };

    const calendar = await readSlaCalendar();
    const pausedMs = slaDurationBetween(ticket.slaPausedAt as Date, now, calendar);

    return {
      slaPausedAt: null,
      slaPausedMs: ticket.slaPausedMs + pausedMs,
      firstResponseDueAt: shift(ticket.firstResponseDueAt, pausedMs, calendar),
      resolutionDueAt: shift(ticket.resolutionDueAt, pausedMs, calendar),
      // Les échéances viennent de reculer : l'alerte doit pouvoir repartir sur
      // les nouvelles, sinon un ticket suspendu puis relancé n'avertirait plus
      // jamais personne.
      firstResponseWarnedAt: null,
      resolutionWarnedAt: null,
    };
  } catch (error) {
    console.error(`[sla] suspension non appliquée sur le ticket ${ticketId}`, error);
    return {};
  }
}

function shift(dueAt: Date | null, pausedMs: number, calendar: SlaCalendar): Date | null {
  if (!dueAt || pausedMs <= 0) return dueAt;
  return addSlaDuration(dueAt, pausedMs, calendar);
}

/**
 * Répercute sur les tickets EN COURS le fait qu'un statut se mette (ou cesse) à
 * suspendre l'horloge.
 *
 * Sans ça, cocher la case ne changerait rien pour les dossiers déjà en attente,
 * et la décocher les laisserait suspendus à vie : ils ne reprendraient qu'au
 * prochain changement de statut, et n'apparaîtraient jamais en retard d'ici là.
 * Un réglage qui ne s'applique qu'aux tickets futurs se remarque le jour où on
 * cherche un dossier qui a disparu de toutes les vues.
 *
 * Seuls les tickets ouverts sont touchés : rouvrir la comptabilité d'un dossier
 * clos ne servirait à rien.
 */
export async function applyStatusPauseFlagChange({
  statusId,
  pausesSla,
  now = new Date(),
}: {
  statusId: string;
  pausesSla: boolean;
  now?: Date;
}): Promise<void> {
  try {
    if (pausesSla) {
      await prisma.ticket.updateMany({
        where: { statusId, closedAt: null, slaPausedAt: null },
        data: { slaPausedAt: now },
      });
      return;
    }

    const paused = await prisma.ticket.findMany({
      where: { statusId, closedAt: null, slaPausedAt: { not: null } },
      select: {
        id: true,
        slaPausedAt: true,
        slaPausedMs: true,
        firstResponseDueAt: true,
        resolutionDueAt: true,
      },
    });
    if (paused.length === 0) return;

    const calendar = await readSlaCalendar();

    for (const ticket of paused) {
      const pausedMs = slaDurationBetween(ticket.slaPausedAt as Date, now, calendar);
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          slaPausedAt: null,
          slaPausedMs: ticket.slaPausedMs + pausedMs,
          firstResponseDueAt: shift(ticket.firstResponseDueAt, pausedMs, calendar),
          resolutionDueAt: shift(ticket.resolutionDueAt, pausedMs, calendar),
        },
      });
    }
  } catch (error) {
    console.error(`[sla] bascule de suspension non répercutée pour le statut ${statusId}`, error);
  }
}

/**
 * Arrête l'horloge de première réponse : un agent vient d'adresser un message
 * public au client.
 *
 * `updateMany` avec la condition dans la requête, et non une lecture suivie
 * d'une écriture : c'est le PREMIER message qui compte, et deux réponses
 * simultanées ne doivent pas se disputer l'horodatage. La condition
 * `firstRespondedAt: null` fait que seule la première l'emporte.
 */
export async function markSlaFirstResponse(ticketId: string, at: Date = new Date()): Promise<void> {
  try {
    await prisma.ticket.updateMany({
      where: { id: ticketId, firstRespondedAt: null },
      data: { firstRespondedAt: at },
    });
  } catch (error) {
    console.error(`[sla] première réponse non horodatée sur le ticket ${ticketId}`, error);
  }
}

/**
 * Champs d'horloge neuve à joindre à une réouverture décidée par un agent
 * (passage d'un statut clos vers un statut ouvert depuis le panneau
 * d'attributs). Vide si le ticket n'était pas clos — le cas courant.
 *
 * Même règle que la réouverture automatique sur relance du client
 * (`restartSlaOnReopen`), et volontairement une seule règle à retenir : un
 * ticket qui revient dans la file repart sur le délai que l'équipe s'engage à
 * tenir. Réveiller les anciennes échéances l'afficherait « en retard de trois
 * semaines » à la seconde où il réapparaît, ce qui ne dit rien de l'attente
 * réelle de qui que ce soit.
 */
export async function slaFieldsForReopen({
  ticketId,
  priorityId,
  at = new Date(),
}: {
  ticketId: string;
  /** Priorité visée, quand le même geste la change aussi. À défaut, celle en base. */
  priorityId?: string;
  at?: Date;
}): Promise<{
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstRespondedAt?: Date | null;
  slaPausedAt?: Date | null;
  slaPausedMs?: number;
  firstResponseWarnedAt?: Date | null;
  resolutionWarnedAt?: Date | null;
}> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { closedAt: true, priorityId: true },
    });
    if (!ticket?.closedAt) return {};

    return {
      ...(await slaDueDatesForNewTicket(priorityId ?? ticket.priorityId, at)),
      firstRespondedAt: null,
      slaPausedAt: null,
      slaPausedMs: 0,
      firstResponseWarnedAt: null,
      resolutionWarnedAt: null,
    };
  } catch (error) {
    console.error(`[sla] horloge non réarmée à la réouverture du ticket ${ticketId}`, error);
    return {};
  }
}

/**
 * Repart d'une horloge neuve quand un client relance un ticket clos.
 *
 * Sans ça, un ticket rouvert hériterait d'échéances vieilles de plusieurs
 * semaines et s'afficherait en retard à la seconde où il revient dans la file —
 * un retard qui ne dirait rien de l'attente réelle du client. Une relance est
 * une nouvelle demande d'attention : elle mérite le délai que l'équipe s'est
 * engagée à tenir, décompté depuis la relance.
 */
export async function restartSlaOnReopen(ticketId: string, at: Date = new Date()): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { priorityId: true },
    });
    if (!ticket) return;

    const due = await slaDueDatesForNewTicket(ticket.priorityId, at);

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...due,
        firstRespondedAt: null,
        slaPausedAt: null,
        slaPausedMs: 0,
        firstResponseWarnedAt: null,
        resolutionWarnedAt: null,
      },
    });
  } catch (error) {
    console.error(`[sla] horloge non réarmée à la réouverture du ticket ${ticketId}`, error);
  }
}
