"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCount, formatShare } from "@/lib/stats-format";
import { formatDateTime } from "@/lib/format-date";
import { analyzeFrequentIssues, type StatsQuery } from "@/lib/actions/statistics";
import type { IssueThemeAnalysis } from "@/lib/issue-themes";

/**
 * Les problèmes les plus fréquents, regroupés par le modèle de langage.
 *
 * Lancé sur un CLIC et non au rendu de la page, comme la détection de doublons et
 * pour la même raison : l'appel est facturé au jeton, et personne n'a demandé
 * d'analyse en ouvrant un écran de statistiques. Une lecture déjà en cache
 * revient en revanche d'elle-même à l'ouverture — elle ne coûte rien.
 *
 * Ce qui est envoyé au fournisseur : le numéro et le sujet des tickets de la
 * période, tronqués. Rien du fil, rien des notes internes, rien de l'identité des
 * clients. La carte le dit à l'écran plutôt que de le laisser dans le code : une
 * équipe doit pouvoir savoir ce qui sort de son outil.
 *
 * Les comptes affichés sont recalculés depuis les tickets réellement rattachés,
 * jamais repris du modèle : un total annoncé par une IA est un total à vérifier.
 */
export function IssueThemesPanel({ query }: { query: StatsQuery }) {
  const [analysis, setAnalysis] = useState<IssueThemeAnalysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasLooked, setHasLooked] = useState(false);

  // Clé de la période : c'est elle qui doit relancer la lecture du cache, pas le
  // montage du composant. Sans ça, changer de période garderait à l'écran
  // l'analyse de la précédente, avec ses chiffres devenus faux.
  const queryKey = JSON.stringify(query);
  const lastQueryKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastQueryKey.current === queryKey) return;
    lastQueryKey.current = queryKey;

    setAnalysis(null);
    setMessage(null);
    setHasLooked(false);

    let cancelled = false;

    // Sans `force` : cet appel ne déclenche RIEN chez le fournisseur, il ne fait
    // que demander si la réponse est déjà en mémoire.
    analyzeFrequentIssues(query)
      .then((result) => {
        if (cancelled) return;
        setAnalysis(result.analysis);
        setHasLooked(true);
      })
      // Silencieux : la période vient de changer, l'agent lit ses volumes. Une
      // erreur d'IA ne doit pas s'afficher tant qu'il n'a rien demandé.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  async function run() {
    setIsRunning(true);
    setMessage(null);
    try {
      const result = await analyzeFrequentIssues(query, { force: true });
      setAnalysis(result.analysis);
      setMessage(result.skippedReason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "L'analyse a échoué.");
    } finally {
      setIsRunning(false);
      setHasLooked(true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={isRunning} className="h-8">
          {isRunning ? <Loader2 className="animate-spin" /> : analysis ? <RefreshCw /> : <Sparkles />}
          {analysis ? "Relancer l'analyse" : "Analyser les demandes"}
        </Button>

        {analysis && (
          <p className="text-xs text-muted-foreground">
            {formatCount(analysis.analyzedCount)} sujets analysés · {analysis.model} ·{" "}
            {formatDateTime(analysis.generatedAt)}
          </p>
        )}
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {analysis && analysis.themes.length > 0 && (
        <ol className="space-y-3">
          {analysis.themes.map((theme, index) => (
            <li key={`${theme.label}-${index}`} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-medium">{theme.label}</p>
                <p className="shrink-0 text-sm tabular-nums">
                  {formatCount(theme.count)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {formatShare(theme.share)}
                  </span>
                </p>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-viz-accent"
                  style={{ width: `${Math.max(theme.share * 100, 2)}%` }}
                />
              </div>

              {theme.insight && (
                <p className="text-xs leading-snug text-muted-foreground">{theme.insight}</p>
              )}

              {/* Les tickets du thème, nommément : une analyse qu'on ne peut pas
                  vérifier ne sert à rien. Le renvoi passe par la recherche de la
                  file, qui accepte le numéro tel qu'il est affiché partout. */}
              <p className="flex flex-wrap gap-x-2 gap-y-1">
                {theme.ticketNumbers.slice(0, 12).map((number) => (
                  <Link
                    key={number}
                    href={`/tickets?search=${number}`}
                    className="font-mono text-[11px] text-muted-foreground tabular-nums hover:text-foreground hover:underline"
                  >
                    #{number}
                  </Link>
                ))}
                {theme.ticketNumbers.length > 12 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{theme.ticketNumbers.length - 12}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}

      {analysis && analysis.themes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun motif ne se dégage : les demandes de la période portent sur des sujets distincts.
        </p>
      )}

      {analysis && analysis.unclassifiedCount > 0 && (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {formatCount(analysis.unclassifiedCount)} demandes n&apos;entrent dans aucun thème — elles
          n&apos;ont pas d&apos;équivalent sur la période.
        </p>
      )}

      {!analysis && !message && hasLooked && !isRunning && (
        <p className="text-sm text-muted-foreground">
          Regroupe les demandes de la période par problème réel, là où le relevé lexical ne compte
          que des mots. Seuls le numéro et le sujet des tickets sont transmis au fournisseur d&apos;IA
          configuré.
        </p>
      )}
    </div>
  );
}
