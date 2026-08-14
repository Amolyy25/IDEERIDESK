import { formatCount, formatShare } from "@/lib/stats-format";
import type { IssueSignals } from "@/lib/issue-themes";
import { StatsEmpty } from "@/components/stats/stats-card";

/**
 * Le relevé lexical des sujets de la période : les expressions, puis les mots.
 *
 * Gratuit, calculé en local, disponible sans clé API — c'est la moitié de la
 * réponse à « quel est notre problème le plus fréquent ? » qu'on peut donner sans
 * rien envoyer à un tiers. Sa limite est affichée sous le tableau plutôt que
 * cachée : « erreur » et « bug » y comptent séparément, et c'est précisément ce
 * que le regroupement par IA vient corriger dans la carte voisine.
 *
 * Les expressions (deux mots consécutifs) avant les mots seuls, parce qu'elles
 * désignent presque toujours quelque chose d'actionnable (« export mandats »)
 * quand un mot isolé reste ambigu (« export »).
 */
export function IssueSignalsList({ signals }: { signals: IssueSignals }) {
  if (signals.analyzed === 0) {
    return <StatsEmpty>Aucun ticket sur cette période.</StatsEmpty>;
  }

  if (signals.phrases.length === 0 && signals.words.length === 0) {
    return (
      <StatsEmpty>
        Aucun terme ne revient assez souvent sur cette période pour dégager un motif.
      </StatsEmpty>
    );
  }

  return (
    <div className="space-y-4">
      {signals.phrases.length > 0 && (
        <TermGroup
          title="Expressions les plus fréquentes"
          terms={signals.phrases}
          total={signals.analyzed}
        />
      )}

      {signals.words.length > 0 && (
        <TermGroup title="Mots les plus fréquents" terms={signals.words} total={signals.analyzed} />
      )}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Relevé sur {formatCount(signals.analyzed)} sujets de tickets
        {signals.truncated && " (les plus récents de la période)"}. Les mots vides et les formules de
        politesse sont écartés. Deux formulations d&apos;un même problème comptent ici séparément.
      </p>
    </div>
  );
}

function TermGroup({
  title,
  terms,
  total,
}: {
  title: string;
  terms: IssueSignals["words"];
  total: number;
}) {
  const max = Math.max(...terms.map((term) => term.tickets), 1);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1.5">
        {terms.map((term) => (
          <li key={term.term} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{term.term}</span>
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-viz-accent"
                style={{ width: `${Math.max((term.tickets / max) * 100, 4)}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums">
              {formatCount(term.tickets)} / {formatCount(total)}
              <span className="ml-1 text-muted-foreground">{formatShare(term.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
