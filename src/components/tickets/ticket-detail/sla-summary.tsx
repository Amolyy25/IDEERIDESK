"use client";

import { useNow } from "@/components/tickets/use-now";
import { formatDateTime } from "@/lib/format-date";
import { formatSlaDuration } from "@/lib/sla";
import { cn } from "@/lib/utils";

/**
 * Les deux horloges du ticket, côte à côte, sur sa fiche.
 *
 * La file n'en montre qu'une — celle qui appelle une action — parce qu'une ligne
 * de liste doit se lire d'un coup d'œil. Ici il y a la place pour les deux, et
 * c'est l'endroit où un agent vient comprendre ce qui a été tenu et ce qui ne
 * l'a pas été : une première réponse rendue dans les temps sur un dossier qui
 * traîne depuis n'est pas la même histoire qu'un ticket jamais ouvert.
 *
 * Comme `SlaBadge`, l'affichage attend l'hydratation (voir `useNow`) : le temps
 * restant se compte sur l'horloge du navigateur, pas sur celle du serveur.
 */

type SlaTicket = {
  firstResponseDueAt: Date | string | null;
  resolutionDueAt: Date | string | null;
  firstRespondedAt: Date | string | null;
  slaPausedAt: Date | string | null;
  closedAt: Date | string | null;
};

export function SlaSummary({ ticket }: { ticket: SlaTicket }) {
  const now = useNow();
  const rows = now === null ? null : buildRows(ticket, now);

  return (
    <div className="space-y-2 text-xs">
      <Row label="Première réponse" value={rows?.firstResponse} />
      <Row label="Résolution" value={rows?.resolution} />
      {rows?.paused && (
        <p className="pt-1 text-[11px] text-muted-foreground">
          Horloge suspendue par le statut courant : les échéances repartiront d&apos;autant.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: { text: string; tone: string } }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", value?.tone ?? "text-muted-foreground/60")}>
        {value?.text ?? " "}
      </span>
    </div>
  );
}

const MET = "text-foreground";
const MISSED = "font-medium text-destructive";
const SOON = "font-medium text-amber-600 dark:text-amber-500";
const NEUTRAL = "text-muted-foreground";
const NONE = "text-muted-foreground/60";

function buildRows(ticket: SlaTicket, now: number) {
  const paused = toDate(ticket.slaPausedAt) !== null;

  return {
    paused,
    firstResponse: clockRow({
      dueAt: toDate(ticket.firstResponseDueAt),
      doneAt: toDate(ticket.firstRespondedAt),
      paused,
      now,
    }),
    resolution: clockRow({
      dueAt: toDate(ticket.resolutionDueAt),
      doneAt: toDate(ticket.closedAt),
      paused,
      now,
    }),
  };
}

/**
 * Une horloge, dans l'un de ses quatre états. L'ordre des tests compte : ce qui
 * est ARRIVÉ (le client a été servi, le dossier est clos) prime toujours sur ce
 * qui était prévu — un engagement tenu ne se relit pas au présent.
 */
function clockRow({
  dueAt,
  doneAt,
  paused,
  now,
}: {
  dueAt: Date | null;
  doneAt: Date | null;
  paused: boolean;
  now: number;
}): { text: string; tone: string } {
  if (doneAt) {
    if (!dueAt) return { text: formatDateTime(doneAt), tone: NEUTRAL };
    const lateMs = doneAt.getTime() - dueAt.getTime();
    if (lateMs > 0) {
      return { text: `Dépassée de ${formatSlaDuration(lateMs)}`, tone: MISSED };
    }
    return { text: `Tenue (${formatDateTime(doneAt)})`, tone: MET };
  }

  if (!dueAt) return { text: "Aucun engagement", tone: NONE };
  if (paused) return { text: `En pause · ${formatDateTime(dueAt)}`, tone: NEUTRAL };

  const remainingMs = dueAt.getTime() - now;
  if (remainingMs < 0) {
    return { text: `En retard de ${formatSlaDuration(remainingMs)}`, tone: MISSED };
  }

  const tone = remainingMs <= 60 * 60 * 1000 ? SOON : NEUTRAL;
  return { text: `Dans ${formatSlaDuration(remainingMs)}`, tone };
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
