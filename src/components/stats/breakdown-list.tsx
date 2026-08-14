import { formatCount, formatShare } from "@/lib/stats-format";
import type { BreakdownRow } from "@/lib/statistics";
import { StatsEmpty } from "@/components/stats/stats-card";

/**
 * Une répartition : le libellé, sa part en barre, son compte et son pourcentage.
 *
 * Toutes les barres portent la MÊME teinte, et la couleur configurée du statut ou
 * du produit reste une pastille à côté de son libellé. C'est délibéré. Peindre
 * chaque barre de la couleur de sa valeur reviendrait à coder deux fois la même
 * information (la longueur dit déjà le volume) avec des couleurs saisies à la
 * main dans les réglages, dont rien ne garantit qu'elles restent distinguables
 * l'une de l'autre ni lisibles sur la carte.
 *
 * Le compte et la part sont TOUJOURS écrits. Une barre sans son chiffre oblige à
 * estimer une longueur, et la valeur ne doit jamais dépendre d'un survol.
 */
export function BreakdownList({
  rows,
  emptyLabel,
  /** Lignes affichées au maximum ; le reste est réuni sous « Autres ». */
  limit = 8,
}: {
  rows: BreakdownRow[];
  emptyLabel: string;
  limit?: number;
}) {
  const filled = rows.filter((row) => row.count > 0);
  if (filled.length === 0) {
    return <StatsEmpty>{emptyLabel}</StatsEmpty>;
  }

  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).filter((row) => row.count > 0);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);
  const restShare = rest.reduce((sum, row) => sum + row.share, 0);

  // Les barres se comparent au maximum de la répartition et non au total : sur
  // une dimension à douze valeurs, tout rapporté au total donne douze traits
  // écrasés dont on ne distingue plus rien.
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className="space-y-2.5">
      {shown.map((row) => (
        <Row key={row.id} row={row} max={max} />
      ))}

      {restCount > 0 && (
        <Row
          row={{
            id: "__rest__",
            label: `${rest.length} autres`,
            color: null,
            count: restCount,
            share: restShare,
          }}
          max={max}
        />
      )}
    </ul>
  );
}

function Row({ row, max }: { row: BreakdownRow; max: number }) {
  const percent = (row.count / max) * 100;

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          {row.color && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
          )}
          <span className="truncate text-sm">{row.label}</span>
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          {formatCount(row.count)}
          <span className="ml-1.5 text-xs text-muted-foreground">{formatShare(row.share)}</span>
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-viz-accent"
          style={{ width: `${row.count === 0 ? 0 : Math.max(percent, 2)}%` }}
        />
      </div>
    </li>
  );
}
