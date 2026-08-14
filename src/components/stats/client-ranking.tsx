import { formatCount } from "@/lib/stats-format";
import { RelativeTime } from "@/components/tickets/relative-time";
import type { ClientStatRow } from "@/lib/statistics";
import { StatsEmpty } from "@/components/stats/stats-card";

/**
 * Qui a le plus sollicité le support sur la période.
 *
 * Volontairement réduit à ce qui sert à lire un volume : un nom, sa société, ses
 * compteurs. Ni email ni téléphone — ils ne disent rien de plus ici et sont à
 * leur place sur la fiche du contact, où l'on va justement quand on a besoin de
 * joindre quelqu'un.
 *
 * Une fiche dont l'identité a été effacée (droit à l'effacement) est signalée
 * comme telle : le nom affiché est alors un pseudonyme, et il ne faut pas le
 * prendre pour un contact joignable.
 */
export function ClientRanking({ rows, distinct }: { rows: ClientStatRow[]; distinct: number }) {
  if (rows.length === 0) {
    return <StatsEmpty>Aucun ticket rattaché à un contact sur cette période.</StatsEmpty>;
  }

  const max = Math.max(...rows.map((row) => row.tickets), 1);

  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {rows.map((row, index) => (
          <li key={row.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {row.name}
                    {row.anonymized && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(anonymisé)</span>
                    )}
                  </span>
                  {row.company && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.company}
                    </span>
                  )}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-sm tabular-nums">
                  {formatCount(row.tickets)}{" "}
                  <span className="text-xs text-muted-foreground">
                    {row.tickets === 1 ? "ticket" : "tickets"}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatCount(row.closed)} clos
                  {row.awaitingReply > 0 && ` · ${formatCount(row.awaitingReply)} sans réponse`}
                </span>
              </span>
            </div>

            <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-viz-accent"
                style={{ width: `${Math.max((row.tickets / max) * 100, 2)}%` }}
              />
            </div>

            {/* `RelativeTime` et non un rendu serveur : « il y a 2 heures »
                calculé à la génération de la page se figerait, et rafraîchirait
                un écart faux à chaque minute passée sur l'écran. */}
            <p className="ml-6 text-xs text-muted-foreground">
              Dernière demande{" "}
              <RelativeTime date={row.lastTicketAt} className="text-xs text-muted-foreground" />
            </p>
          </li>
        ))}
      </ol>

      {/* Le dénominateur du classement : « 3 contacts sur 47 » se lit tout
          autrement que « 3 contacts sur 4 ». */}
      <p className="border-t pt-3 text-xs text-muted-foreground">
        {formatCount(distinct)} {distinct === 1 ? "contact distinct" : "contacts distincts"} sur la
        période
        {distinct > rows.length && ` — les ${rows.length} premiers sont affichés`}.
      </p>
    </div>
  );
}
