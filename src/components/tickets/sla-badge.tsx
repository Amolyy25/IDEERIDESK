"use client";

import { useNow } from "@/components/tickets/use-now";
import { formatDateTime } from "@/lib/format-date";
import { formatSlaDuration, resolveSlaState, slaTargetLabels, type SlaTicketFields } from "@/lib/sla";
import { cn } from "@/lib/utils";

/**
 * Le temps qu'il reste sur un ticket, ou celui qu'on a déjà dépassé.
 *
 * Composant client et non valeur calculée au rendu serveur : une échéance
 * s'approche pendant qu'on regarde la file. L'horloge vient de `useNow`, qui
 * renvoie `null` tant que l'hydratation n'a pas eu lieu — l'heure du serveur et
 * celle du navigateur ne coïncident pas, et afficher les deux produirait une
 * erreur d'hydratation à chaque ligne.
 *
 * Une seule échéance est montrée, celle qui appelle une action maintenant : la
 * première réponse tant que personne n'a écrit au client, la résolution ensuite.
 * Le libellé complet est dans l'infobulle, pour que la colonne reste étroite.
 */

/** En dessous, l'échéance passe en ambre : c'est le moment de s'en occuper. */
const SOON_MS = 60 * 60 * 1000;

export function SlaBadge({ ticket, className }: { ticket: SlaTicketFields; className?: string }) {
  const now = useNow();

  if (now === null) return <span className={cn("text-muted-foreground/60", className)}> </span>;

  const rendered = render(ticket, new Date(now));

  return (
    <span className={cn("whitespace-nowrap", rendered.tone, className)} title={rendered.title}>
      {rendered.label}
    </span>
  );
}

function render(ticket: SlaTicketFields, now: Date) {
  const state = resolveSlaState(ticket, now);

  if (state.kind === "none" || state.kind === "done") {
    return { label: "—", tone: "text-muted-foreground/60", title: undefined };
  }

  const target = slaTargetLabels[state.target];
  const due = `${target} attendue le ${formatDateTime(state.dueAt)}`;

  if (state.kind === "paused") {
    return {
      label: "En pause",
      tone: "text-muted-foreground",
      title: `${due}. Horloge suspendue par le statut du ticket.`,
    };
  }

  if (state.kind === "breached") {
    return {
      label: `Retard ${formatSlaDuration(state.overdueMs)}`,
      tone: "font-medium text-destructive",
      title: `${due} — dépassée.`,
    };
  }

  return {
    label: formatSlaDuration(state.remainingMs),
    tone: state.remainingMs <= SOON_MS ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground",
    title: due,
  };
}
