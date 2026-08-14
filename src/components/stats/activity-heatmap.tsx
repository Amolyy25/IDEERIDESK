import { formatCount, hourLabel, weekdayLabel, weekdayShortLabel } from "@/lib/stats-format";
import type { ActivityHeatmap as ActivityHeatmapData } from "@/lib/statistics";
import { StatsEmpty } from "@/components/stats/stats-card";

/**
 * Quand les demandes arrivent : sept lignes de vingt-quatre heures.
 *
 * C'est la seule vue de la page qui répond à « à quelle heure faut-il être là ? ».
 * L'axe du temps moyenne les journées, la répartition par produit ignore
 * l'horaire ; un pic le lundi matin ne se voit que sur cette grille.
 *
 * Une seule teinte, quatre paliers, du clair au foncé — jamais un arc-en-ciel : la
 * grandeur mesurée est un volume, elle n'a donc pas d'identité à porter. Les
 * paliers ont leurs propres valeurs en mode sombre (voir `--viz-scale-*`), le
 * premier restant détaché du fond pour qu'une heure à un seul ticket se voie
 * quand même.
 *
 * Le chiffre exact d'une case s'obtient au survol, mais l'information portée par
 * la grille ne s'y limite pas : le pic est écrit en toutes lettres au-dessus, et
 * chaque case renseignée porte son libellé pour un lecteur d'écran.
 */
export function ActivityHeatmap({ data }: { data: ActivityHeatmapData }) {
  if (data.total === 0) {
    return <StatsEmpty>Aucun ticket sur cette période.</StatsEmpty>;
  }

  return (
    <div className="space-y-3">
      {data.peak && (
        <p className="text-sm">
          <span className="text-muted-foreground">Créneau le plus chargé : </span>
          <span className="font-medium">
            {weekdayLabel(data.peak.weekday)} {hourLabel(data.peak.hour)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            — {formatCount(data.peak.count)}{" "}
            {data.peak.count === 1 ? "ticket" : "tickets"}
          </span>
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[34rem]">
          {/* Graduations toutes les trois heures : vingt-quatre libellés se
              chevaucheraient, et l'heure exacte se lit au survol. */}
          <div className="mb-1 flex gap-[2px] pl-7">
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className="min-w-0 flex-1 text-[9px] text-muted-foreground tabular-nums"
                aria-hidden
              >
                {hour % 3 === 0 ? hour : ""}
              </span>
            ))}
          </div>

          <div className="space-y-[2px]">
            {data.matrix.map((row, weekday) => (
              <div key={weekday} className="flex items-center gap-[2px]">
                <span className="w-7 shrink-0 text-[10px] text-muted-foreground">
                  {weekdayShortLabel(weekday)}
                </span>
                {row.map((count, hour) => (
                  <Cell
                    key={hour}
                    count={count}
                    max={data.max}
                    label={`${weekdayLabel(weekday)} ${hourLabel(hour)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Scale max={data.max} />
    </div>
  );
}

function Cell({ count, max, label }: { count: number; max: number; label: string }) {
  const step = scaleStep(count, max);

  return (
    <span
      // Écart de 2 px entre les cases (la grille porte `gap-[2px]`) : c'est le
      // vide qui les sépare, pas un contour.
      className={`h-5 min-w-0 flex-1 rounded-[2px] ${step}`}
      // Infobulle native : elle complète la lecture, elle ne la conditionne pas.
      title={`${label} — ${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`}
    >
      {count > 0 && (
        <span className="sr-only">
          {label} : {formatCount(count)} {count === 1 ? "ticket" : "tickets"}.
        </span>
      )}
    </span>
  );
}

/**
 * Palier d'une case. Quatre bandes rapportées au maximum de la grille, et non des
 * seuils en valeur absolue : la même grille doit rester lisible pour une équipe
 * qui reçoit dix tickets par semaine comme pour une qui en reçoit mille.
 */
function scaleStep(count: number, max: number): string {
  if (count === 0) return "bg-muted/50";
  const ratio = count / Math.max(max, 1);
  if (ratio <= 0.25) return "bg-viz-scale-1";
  if (ratio <= 0.5) return "bg-viz-scale-2";
  if (ratio <= 0.75) return "bg-viz-scale-3";
  return "bg-viz-scale-4";
}

function Scale({ max }: { max: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>Moins</span>
      <span className="flex gap-[2px]" aria-hidden>
        <span className="size-3 rounded-[2px] bg-muted/50" />
        <span className="size-3 rounded-[2px] bg-viz-scale-1" />
        <span className="size-3 rounded-[2px] bg-viz-scale-2" />
        <span className="size-3 rounded-[2px] bg-viz-scale-3" />
        <span className="size-3 rounded-[2px] bg-viz-scale-4" />
      </span>
      <span>Plus</span>
      <span className="ml-1 tabular-nums">
        (0 à {formatCount(max)} {max === 1 ? "ticket" : "tickets"} par créneau)
      </span>
    </div>
  );
}
