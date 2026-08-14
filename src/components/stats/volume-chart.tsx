import { formatCount } from "@/lib/stats-format";
import type { TimelinePoint } from "@/lib/statistics";
import { StatsEmpty } from "@/components/stats/stats-card";

/**
 * Arrivées et clôtures dans le temps.
 *
 * DEUX séries et pas une : le volume reçu ne dit rien seul. Une file qui grossit
 * et une file qui se vide produisent la même courbe d'arrivées — c'est l'écart
 * entre les deux séries qui raconte si l'équipe suit le rythme.
 *
 * Les arrivées portent la teinte, les clôtures le gris : ce n'est pas de
 * l'économie de couleur, c'est la forme « mise en avant » (une série est le
 * sujet, l'autre est le contexte). Elle évite au passage de dépendre de deux
 * teintes que le lecteur devrait apprendre.
 *
 * Rendu en div plutôt qu'en SVG, et sans dépendance de graphique : deux barres
 * par colonne et quelques filets sont exactement ce que le CSS fait le mieux, le
 * tout reste rendu côté serveur, et il n'y a rien à hydrater.
 */

/** Hauteur de la zone de tracé. Les libellés d'axe sont EN DEHORS. */
const PLOT_HEIGHT_CLASS = "h-44";

/** Colonnes au-delà desquelles l'axe n'affiche plus un libellé sur deux. */
const MAX_TICKS = 10;

export function VolumeChart({ points }: { points: TimelinePoint[] }) {
  const max = points.reduce((highest, point) => Math.max(highest, point.created, point.closed), 0);

  if (points.length === 0 || max === 0) {
    return <StatsEmpty>Aucun ticket sur cette période.</StatsEmpty>;
  }

  // Un filet haut à la valeur ronde juste au-dessus du maximum, et non au
  // maximum exact : « 12 » plutôt qu'un trait collé au sommet de la plus grande
  // barre, qui donnerait à croire à un plafond.
  const ceiling = niceCeiling(max);
  const tickEvery = Math.ceil(points.length / MAX_TICKS);

  return (
    <div>
      <Legend />

      <div className="flex gap-2">
        {/* Gouttière des graduations : deux valeurs suffisent, le reste se lit
            dans l'infobulle et dans les tuiles au-dessus. */}
        <div
          className={`${PLOT_HEIGHT_CLASS} flex w-8 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground tabular-nums`}
        >
          <span>{formatCount(ceiling)}</span>
          <span>{formatCount(Math.round(ceiling / 2))}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className={`relative ${PLOT_HEIGHT_CLASS}`}>
            {/* Filets pleins et d'une épaisseur de cheveu, un cran au-dessus du
                fond : un quadrillage en pointillés se lit comme un seuil. */}
            <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-border" aria-hidden />
            <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border" aria-hidden />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border" aria-hidden />

            <ol className="flex h-full items-end gap-px">
              {points.map((point) => (
                <Column key={point.key} point={point} ceiling={ceiling} />
              ))}
            </ol>
          </div>

          <div className="mt-1.5 flex gap-px" aria-hidden>
            {points.map((point, index) => (
              <span
                key={point.key}
                className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
              >
                {index % tickEvery === 0 ? point.tick : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ point, ceiling }: { point: TimelinePoint; ceiling: number }) {
  return (
    <li className="group/col relative flex h-full min-w-0 flex-1 items-end justify-center">
      {/* Zone de survol : toute la hauteur de la colonne, et non la barre seule —
          viser une barre de 4 px de haut serait un exercice d'adresse. */}
      <span className="absolute inset-0" aria-hidden />

      {/* Deux barres accolées, séparées par un écart de 2 px dans la couleur du
          fond : c'est le vide qui sépare, jamais un contour dessiné autour des
          marques. */}
      <div className="flex h-full w-full items-end justify-center gap-[2px]">
        <Bar value={point.created} ceiling={ceiling} className="bg-viz-accent" />
        <Bar value={point.closed} ceiling={ceiling} className="bg-viz-muted" />
      </div>

      {/* La même information que l'infobulle, en texte : les valeurs ne sont
          jamais accessibles au seul survol. */}
      <span className="sr-only">
        {point.label} : {formatCount(point.created)} reçus, {formatCount(point.closed)} clos.
      </span>

      {/* Infobulle ancrée en HAUT de la colonne, pas au sommet de la barre : la
          carte masque ce qui dépasse, et une infobulle posée sur une barre haute
          se ferait couper. Elle complète l'affichage, elle ne le conditionne pas
          — les mêmes chiffres sont lisibles par un lecteur d'écran ci-dessus et
          dans les tuiles de la page. */}
      <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 group-hover/col:block">
        <div className="rounded-md border bg-popover px-2 py-1 text-[11px] whitespace-nowrap text-popover-foreground shadow-md">
          <p className="font-medium">{point.label}</p>
          <p className="text-muted-foreground tabular-nums">
            {formatCount(point.created)} reçus · {formatCount(point.closed)} clos
          </p>
        </div>
      </div>
    </li>
  );
}

function Bar({
  value,
  ceiling,
  className,
}: {
  value: number;
  ceiling: number;
  className: string;
}) {
  if (value === 0) {
    // Rien à dessiner, mais la place reste prise : sans elle, la barre voisine
    // se recentrerait et les colonnes ne seraient plus comparables entre elles.
    return <span className="w-full max-w-3" aria-hidden />;
  }

  // Plancher de 3 px : une valeur de 1 face à un maximum de 60 rendrait un trait
  // invisible, donc un « aucun » là où il y a « un ».
  const percent = Math.max((value / ceiling) * 100, 3);

  return (
    <span
      // Extrémité arrondie côté donnée, d'équerre sur la ligne de base : la
      // barre pousse depuis l'axe, l'arrondi marque où elle s'arrête.
      className={`w-full max-w-3 rounded-t-[4px] ${className}`}
      style={{ height: `${percent}%` }}
      aria-hidden
    />
  );
}

function Legend() {
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-viz-accent" aria-hidden />
        Tickets reçus
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-viz-muted" aria-hidden />
        Tickets clos
      </li>
    </ul>
  );
}

/** Valeur ronde immédiatement au-dessus du maximum (1, 2, 5, 10, 20, 50, 100…). */
function niceCeiling(max: number): number {
  if (max <= 5) return max;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return Math.round(candidate);
  }
  return Math.round(10 * magnitude);
}
