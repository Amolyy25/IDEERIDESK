import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatChange, formatChangeCount, formatCount } from "@/lib/stats-format";
import type { MetricDelta } from "@/lib/statistics";

/**
 * Une tuile de chiffre : le libellé, la valeur, et l'écart avec la période
 * précédente.
 *
 * La couleur de l'écart dépend du SENS SOUHAITABLE de la mesure, jamais du signe
 * seul : trente nouveaux tickets de plus n'est ni bon ni mauvais (c'est la
 * charge reçue), trente réponses de plus est bon, trente demandes en attente de
 * plus est mauvais. Sans cette distinction, la page peindrait en vert une
 * dégradation.
 *
 * L'écart porte toujours une flèche en plus de sa couleur : la direction ne doit
 * pas se lire à la seule teinte.
 */
export type GoodDirection = "up" | "down" | "none";

export function StatTile({
  label,
  value,
  hint,
  delta,
  goodDirection = "none",
  emphasis = false,
}: {
  label: string;
  /** Valeur déjà mise en forme : la tuile ne décide pas du format. */
  value: string;
  /** Ce que la valeur recouvre, ou de quoi elle se déduit. */
  hint?: string;
  delta?: MetricDelta;
  goodDirection?: GoodDirection;
  /** Tuile de tête : une seule par rangée, pour la mesure qui porte la page. */
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3 shadow-xs">
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      {/* Chiffres proportionnels et non tabulaires : à cette taille, des
          chiffres de largeur égale font paraître « 121 » distendu. Le tabulaire
          est réservé aux colonnes qui doivent s'aligner verticalement. */}
      <p className={cn("font-semibold tracking-tight", emphasis ? "text-3xl" : "text-2xl")}>
        {value}
      </p>
      {delta && <DeltaLine delta={delta} goodDirection={goodDirection} />}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DeltaLine({
  delta,
  goodDirection,
}: {
  delta: MetricDelta;
  goodDirection: GoodDirection;
}) {
  const relative = formatChange(delta.changePercent);
  // Période précédente à zéro : l'écart relatif n'existe pas, mais l'écart en
  // valeur, lui, se dit très bien (« +3 vs 0 »). Le taire laisserait croire à
  // une absence de mouvement.
  const text = relative ?? formatChangeCount(delta.current, delta.previous);
  if (!text) return null;

  const difference = delta.current - delta.previous;
  const Icon = difference === 0 ? ArrowRight : difference > 0 ? ArrowUpRight : ArrowDownRight;

  let tone = "text-muted-foreground";
  if (difference !== 0 && goodDirection !== "none") {
    const isGood = goodDirection === "up" ? difference > 0 : difference < 0;
    tone = isGood ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
  }

  return (
    <p className={cn("flex items-center gap-1 text-xs", tone)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium">{text}</span>
      <span className="text-muted-foreground">
        vs {formatCount(delta.previous)} sur la période précédente
      </span>
    </p>
  );
}
