"use server";

import { requirePermission } from "@/lib/require-permission";
import { rateLimit } from "@/lib/rate-limit";
import { getStatsReport, type StatsFilters, type StatsReport } from "@/lib/statistics";
import {
  analyzeIssueThemes,
  getIssueSignals,
  type IssueSignals,
  type IssueThemeResult,
} from "@/lib/issue-themes";
import { resolveStatsRange } from "@/lib/stats-range";

/**
 * Frontière d'accès des statistiques.
 *
 * Le calcul vit dans `@/lib/statistics` et `@/lib/issue-themes` ; ce module ne
 * fait qu'une chose, et c'est la seule qui compte ici : vérifier la permission
 * avant de lire quoi que ce soit. Une action exportée depuis un fichier
 * `"use server"` est un endpoint HTTP — la garde de la page (`requirePageAccess`)
 * ne protège que l'affichage, pas la donnée.
 *
 * La PÉRIODE est résolue ici, à partir des paramètres bruts, et non reçue déjà
 * calculée de l'appelant : ces paramètres viennent d'une URL, donc de n'importe
 * où. Les faire retraverser `resolveStatsRange` garantit qu'aucun appel ne peut
 * réclamer une plage que la page ne saurait pas afficher, et que l'intitulé lu à
 * l'écran désigne exactement les tickets comptés.
 */

export type StatsQuery = {
  range?: string;
  from?: string;
  to?: string;
  categoryId?: string;
};

function filtersFrom(query: StatsQuery): StatsFilters {
  return { categoryId: query.categoryId || null };
}

export async function getStatistics(query: StatsQuery = {}): Promise<StatsReport> {
  await requirePermission("stats.view");
  return getStatsReport(resolveStatsRange(query), filtersFrom(query));
}

export async function getFrequentIssueSignals(query: StatsQuery = {}): Promise<IssueSignals> {
  await requirePermission("stats.view");
  return getIssueSignals(resolveStatsRange(query), filtersFrom(query));
}

/**
 * Appels au fournisseur d'IA plafonnés par agent et par heure. Chaque analyse est
 * facturée au jeton : sans cette limite, un clic répété sur « Relancer » suffit à
 * vider le budget, et le bouton est précisément fait pour être recliqué.
 */
const ANALYSES_PER_HOUR = 12;

export async function analyzeFrequentIssues(
  query: StatsQuery = {},
  { force = false }: { force?: boolean } = {},
): Promise<IssueThemeResult> {
  const session = await requirePermission("stats.view");

  // La limite ne compte que les analyses FORCÉES : une lecture servie par le
  // cache mémoire ne coûte rien, la décompter reviendrait à punir l'agent qui
  // consulte plusieurs périodes d'affilée.
  if (force) {
    const limit = rateLimit(`stats-themes:${session.user.id}`, ANALYSES_PER_HOUR, 60 * 60 * 1000);
    if (!limit.allowed) {
      return {
        analysis: null,
        skippedReason: "Trop d'analyses demandées. Réessayez dans quelques minutes.",
      };
    }
  }

  return analyzeIssueThemes(resolveStatsRange(query), filtersFrom(query), { force });
}
