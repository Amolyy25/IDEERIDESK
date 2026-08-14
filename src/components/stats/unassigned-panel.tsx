import Link from "next/link";
import { formatCount } from "@/lib/stats-format";
import { RelativeTime } from "@/components/tickets/relative-time";
import { StatsEmpty } from "@/components/stats/stats-card";
import { UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import type { QueueTicketRow } from "@/lib/statistics";

/**
 * Les tickets que personne n'a pris en charge, du plus ancien au plus récent.
 *
 * La seule carte de la page qui ne mesure pas la période mais l'INSTANT : un
 * dossier sans propriétaire est un problème d'aujourd'hui, pas une statistique de
 * mars. C'est aussi pour ça qu'elle nomme les tickets au lieu d'en donner le
 * compte : le geste attendu après cette lecture est d'aller en prendre un.
 */
export function UnassignedPanel({
  count,
  tickets,
}: {
  count: number;
  tickets: QueueTicketRow[];
}) {
  if (count === 0) {
    return <StatsEmpty>Tous les tickets ouverts ont un responsable.</StatsEmpty>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-2xl font-semibold tracking-tight">{formatCount(count)}</span>{" "}
        <span className="text-muted-foreground">
          {count === 1 ? "ticket ouvert sans responsable" : "tickets ouverts sans responsable"}
        </span>
      </p>

      {tickets.length === 0 ? (
        <StatsEmpty>Aucun ticket à afficher.</StatsEmpty>
      ) : (
        <ul className="divide-y">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="py-2 first:pt-0">
              <Link href={`/tickets/${ticket.id}`} className="group block">
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    #{ticket.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm group-hover:underline">
                    {ticket.subject}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ticket.priorityColor }}
                      aria-hidden
                    />
                    {ticket.priorityName}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{ticket.statusName}</span>
                  <span aria-hidden>·</span>
                  <span>
                    ouvert <RelativeTime date={ticket.createdAt} className="text-xs" />
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Renvoi vers la file réellement filtrée, et non vers une liste
          reconstruite ici : l'agent y retrouve ses outils habituels (tri,
          assignation en ligne) au lieu d'un extrait figé. */}
      <Link
        href={`/tickets?assigneeId=${UNASSIGNED_FILTER}&scope=all`}
        className="inline-block border-t pt-3 text-xs text-primary underline"
      >
        Ouvrir la file des tickets non assignés
      </Link>
    </div>
  );
}
