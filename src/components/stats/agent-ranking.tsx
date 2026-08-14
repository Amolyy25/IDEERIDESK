import { formatSlaDuration } from "@/lib/sla";
import { formatCount } from "@/lib/stats-format";
import type { AgentStatRow } from "@/lib/statistics";
import { StatsEmpty } from "@/components/stats/stats-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Ce que chaque agent a traité sur la période.
 *
 * « Traité » se lit en TICKETS DISTINCTS auxquels la personne a répondu
 * publiquement — pas en messages envoyés (répondre trois fois au même dossier
 * n'est pas traiter trois demandes) et pas en tickets assignés (un dossier confié
 * sans réponse n'est pas traité).
 *
 * Les deux colonnes « dont » répondent à la question « les tickets QUI LUI
 * CORRESPONDENT » sous ses deux sens, qui ne se recouvrent pas : ceux qui étaient
 * sur son nom, et ceux qui relèvent des produits couverts par ses groupes. Un
 * agent peut très bien traiter beaucoup sans que rien ne lui soit assigné — c'est
 * même le fonctionnement normal d'une file partagée — et l'écart entre les deux
 * colonnes est justement ce qui se lit ici.
 *
 * Ce tableau est nominatif : il dit combien chacun a fait. Il ne dit pas ce que
 * chacun a ouvert, ni quand — cette lecture-là appartient au journal d'audit, et
 * à sa permission.
 */
export function AgentRanking({ rows }: { rows: AgentStatRow[] }) {
  if (rows.length === 0) {
    return <StatsEmpty>Aucun agent à afficher.</StatsEmpty>;
  }

  const max = Math.max(...rows.map((row) => row.handledTickets), 1);

  return (
    // Débordement latéral assumé (`Table` porte déjà son défilement) plutôt que
    // des colonnes sacrifiées : chacune répond à une question distincte, et
    // masquer la médiane sur écran étroit ne laisserait que le volume.
    <div className="-mx-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Agent</TableHead>
            <TableHead className="text-right">Traités</TableHead>
            <TableHead className="text-right">dont assignés</TableHead>
            <TableHead className="text-right">dont son périmètre</TableHead>
            <TableHead className="text-right">1res réponses</TableHead>
            <TableHead className="text-right">Délai médian</TableHead>
            <TableHead className="text-right">Réponses</TableHead>
            <TableHead className="text-right">Notes</TableHead>
            <TableHead className="text-right">Clos</TableHead>
            <TableHead className="pr-4 text-right">En cours</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4">
                <div className="min-w-40 space-y-1">
                  <p className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="truncate font-medium">{row.name}</span>
                  </p>
                  {/* La barre reprend la colonne « Traités » : elle donne l'ordre
                      de grandeur d'un coup d'œil, le chiffre reste à sa place. */}
                  <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-viz-accent"
                      style={{
                        width: `${row.handledTickets === 0 ? 0 : Math.max((row.handledTickets / max) * 100, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              </TableCell>

              <TableCell className="text-right font-medium tabular-nums">
                {formatCount(row.handledTickets)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.handledAssignedToThem)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.handledOnOwnScope)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.firstResponses)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.medianFirstResponseMs === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatSlaDuration(row.medianFirstResponseMs)
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.publicReplies)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatCount(row.internalNotes)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.closedAssigned)}
              </TableCell>
              <TableCell className="pr-4 text-right tabular-nums text-muted-foreground">
                {formatCount(row.openAssignedNow)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
