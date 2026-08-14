import { TriangleAlert } from "lucide-react";
import { requirePageAccess } from "@/lib/require-page-access";
import { getStatistics, getFrequentIssueSignals, type StatsQuery } from "@/lib/actions/statistics";
import { getTicketCategories } from "@/lib/actions/categories";
import { formatRangeSpan, resolveStatsRange } from "@/lib/stats-range";
import { formatSlaDuration } from "@/lib/sla";
import { formatCount, formatShare } from "@/lib/stats-format";
import type { DurationSummary, SlaOutcome } from "@/lib/statistics";
import { StatsToolbar } from "@/components/stats/stats-toolbar";
import { StatTile } from "@/components/stats/stat-tile";
import { StatsCard } from "@/components/stats/stats-card";
import { QueueSnapshot } from "@/components/stats/queue-snapshot";
import { VolumeChart } from "@/components/stats/volume-chart";
import { BreakdownList } from "@/components/stats/breakdown-list";
import { AgentRanking } from "@/components/stats/agent-ranking";
import { ClientRanking } from "@/components/stats/client-ranking";
import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import { IssueSignalsList } from "@/components/stats/issue-signals-list";
import { IssueThemesPanel } from "@/components/stats/issue-themes-panel";
import { UnassignedPanel } from "@/components/stats/unassigned-panel";

/**
 * Statistiques du support sur une période choisie.
 *
 * Ce que cet écran doit permettre de dire, dans cet ordre : combien de demandes
 * sont arrivées et ce qu'elles sont devenues ; ce qui reste sur le feu en ce
 * moment ; à quel rythme l'équipe répond et si les engagements sont tenus ; d'où
 * viennent les demandes ; qui les traite ; qui les envoie ; et de quoi elles
 * parlent.
 *
 * Un principe tient toute la page : chaque carte annonce la POPULATION qu'elle
 * mesure. Les volumes portent sur les tickets arrivés dans la période, les délais
 * sur le travail fait pendant la période, et l'état de la file sur l'instant
 * présent — trois populations qu'un tableau de bord silencieux ferait passer pour
 * une seule. Le détail du raisonnement est dans `src/lib/statistics.ts`.
 */

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  categoryId?: string;
}>;

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  // La donnée est protégée par « stats.view » dans les actions — pas par cette
  // garde, qui ne protège que l'affichage.
  const [, params] = await Promise.all([requirePageAccess("stats.view"), searchParams]);

  const query: StatsQuery = {
    range: params.range,
    from: params.from,
    to: params.to,
    categoryId: params.categoryId,
  };

  // La même résolution que celle des actions, pour l'INTITULÉ seulement : les
  // chiffres sont comptés côté action, contre la période qu'elle résout
  // elle-même. Deux résolutions du même paramètre donnent la même période, c'est
  // tout l'intérêt d'avoir mis ce calcul dans un module pur.
  const range = resolveStatsRange(query);

  const [report, signals, categories] = await Promise.all([
    getStatistics(query),
    getFrequentIssueSignals(query),
    getTicketCategories(),
  ]);

  const { volume, durations, sla, breakdowns } = report;

  return (
    <div className="flex flex-col gap-4 bg-muted/20 p-6">
      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted-foreground">
          {range.label} — {formatRangeSpan(range)}. Les écarts se lisent contre la période
          précédente de même durée.
        </p>
      </div>

      <StatsToolbar activeRange={range.key} products={categories} />

      {report.truncated && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Cette période dépasse le volume que la page lit d&apos;un coup : les répartitions et les
            classements portent sur les tickets les plus récents de la période, pas sur sa totalité.
            Resserrez la plage pour un compte exact.
          </span>
        </p>
      )}

      {/* --- Ce qui est arrivé, et ce que c'est devenu --- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Nouveaux tickets"
          value={formatCount(volume.created.current)}
          delta={volume.created}
          // Aucune direction souhaitable : recevoir plus de demandes n'est ni une
          // bonne ni une mauvaise nouvelle, c'est la charge reçue.
          goodDirection="none"
          emphasis
          hint={
            volume.mergedAsDuplicate > 0
              ? `dont ${formatCount(volume.mergedAsDuplicate)} rattachés à un dossier existant (doublons)`
              : undefined
          }
        />
        <StatTile
          label="Ont reçu une réponse"
          value={formatCount(volume.answered.current)}
          delta={volume.answered}
          goodDirection="up"
          hint={
            volume.answerRate === null
              ? undefined
              : `${formatShare(volume.answerRate)} des tickets arrivés sur la période`
          }
        />
        <StatTile
          label="Clos sur la période"
          value={formatCount(volume.closed.current)}
          delta={volume.closed}
          goodDirection="up"
          hint="Clôtures effectuées pendant la période, quelle que soit la date d'arrivée"
        />
        {/* Sans écart : la cohorte d'une période en cours est plus jeune que
            celle de la précédente, la comparaison conclurait toujours à une
            dégradation (voir src/lib/statistics.ts). */}
        <StatTile
          label="Toujours sans réponse"
          value={formatCount(volume.stillAwaitingReply)}
          hint="Arrivés sur la période, ni répondus ni clos à ce jour"
        />
      </div>

      {/* --- Vitesse et engagements --- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Première réponse (médiane)"
          value={formatDuration(durations.firstResponse.medianMs)}
          hint={durationHint(durations.firstResponse, durations.previousMedianFirstResponseMs)}
        />
        <StatTile
          label="Résolution (médiane)"
          value={formatDuration(durations.resolution.medianMs)}
          hint={durationHint(durations.resolution, durations.previousMedianResolutionMs)}
        />
        <StatTile
          label="Engagement de première réponse"
          value={formatShare(slaRate(sla.firstResponse))}
          hint={slaHint(sla.firstResponse, "réponses parties")}
        />
        <StatTile
          label="Engagement de résolution"
          value={formatShare(slaRate(sla.resolution))}
          hint={slaHint(sla.resolution, "dossiers clos")}
        />
      </div>

      <StatsCard
        title="État de la file en ce moment"
        scope="Instantané, indépendant de la période choisie : c'est ce qui reste à traiter aujourd'hui."
      >
        <QueueSnapshot now={report.now} />
      </StatsCard>

      <StatsCard
        title="Arrivées et clôtures"
        scope={`Tickets reçus et tickets clos, ${bucketLabel(range.bucket)}.`}
      >
        <VolumeChart points={report.timeline} />
      </StatsCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatsCard
          title="Où en sont les tickets arrivés"
          scope="Statut ACTUEL des tickets reçus pendant la période, dans l'ordre du paramétrage."
        >
          <BreakdownList rows={breakdowns.statuses} emptyLabel="Aucun ticket sur cette période." />
        </StatsCard>

        <StatsCard
          title="Priorités"
          scope="Priorité des tickets reçus pendant la période."
        >
          <BreakdownList rows={breakdowns.priorities} emptyLabel="Aucun ticket sur cette période." />
        </StatsCard>

        <StatsCard
          title="Produits concernés"
          scope="Tickets reçus par produit, du plus sollicité au moins sollicité."
        >
          <BreakdownList rows={breakdowns.products} emptyLabel="Aucun ticket sur cette période." />
        </StatsCard>

        <StatsCard
          title="Canaux d'arrivée"
          scope="Formulaire ou boîte par lequel la demande est entrée."
        >
          <BreakdownList rows={breakdowns.channels} emptyLabel="Aucun ticket sur cette période." />
        </StatsCard>
      </div>

      <StatsCard
        title="Activité de l'équipe"
        scope="Tickets distincts auxquels chaque agent a répondu publiquement pendant la période. « Périmètre » = produits couverts par ses groupes."
      >
        <AgentRanking rows={report.agents} />
      </StatsCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatsCard
          title="Contacts les plus demandeurs"
          scope="Tickets déposés pendant la période, par contact."
        >
          <ClientRanking rows={report.clients} distinct={report.distinctClients} />
        </StatsCard>

        <StatsCard
          title="Tickets sans responsable"
          scope="Instantané : tickets ouverts que personne n'a pris en charge, du plus ancien au plus récent."
        >
          <UnassignedPanel
            count={report.unassigned.count}
            tickets={report.unassigned.oldest}
          />
        </StatsCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatsCard
          title="Motifs récurrents"
          scope="Relevé des termes des sujets de la période. Calculé localement, sans appel externe."
        >
          <IssueSignalsList signals={signals} />
        </StatsCard>

        <StatsCard
          title="Problèmes les plus fréquents (IA)"
          scope="Regroupement des demandes de la période par problème réel. Lancé à la demande."
        >
          <IssueThemesPanel query={query} />
        </StatsCard>
      </div>

      <StatsCard
        title="Quand les demandes arrivent"
        scope="Tickets reçus pendant la période, par jour de la semaine et par heure."
      >
        <ActivityHeatmap data={report.heatmap} />
      </StatsCard>
    </div>
  );
}

function formatDuration(value: number | null): string {
  return value === null ? "—" : formatSlaDuration(value);
}

/**
 * Ce qui accompagne une médiane : la moyenne, le neuvième décile, l'effectif
 * mesuré et la période précédente.
 *
 * Les quatre ensemble, parce qu'une médiane seule se lit de travers : sans
 * effectif on ne sait pas si elle porte sur trois tickets ou trois cents, et sans
 * moyenne ni neuvième décile on ne voit pas les dossiers oubliés — ce sont eux
 * qu'un client remarque.
 */
function durationHint(summary: DurationSummary, previousMedian: number | null): string {
  if (summary.count === 0) return "Aucune mesure sur cette période.";

  const parts = [
    `sur ${formatCount(summary.count)} ${summary.count === 1 ? "ticket" : "tickets"}`,
    summary.averageMs === null ? null : `moyenne ${formatSlaDuration(summary.averageMs)}`,
    summary.p90Ms === null ? null : `9 sur 10 en moins de ${formatSlaDuration(summary.p90Ms)}`,
    previousMedian === null
      ? null
      : `période précédente : ${formatSlaDuration(previousMedian)}`,
  ];

  return parts.filter(Boolean).join(" · ");
}

function slaRate(outcome: SlaOutcome): number | null {
  return outcome.committed === 0 ? null : outcome.met / outcome.committed;
}

function slaHint(outcome: SlaOutcome, unit: string): string {
  if (outcome.committed === 0) {
    // Cas fréquent et à dire explicitement : sans délai configuré sur les
    // priorités (Paramètres > SLA), il n'y a aucun engagement à tenir, et un
    // « 0 % » laisserait croire à un échec.
    return `Aucun engagement mesurable sur cette période — vérifiez les délais des priorités dans Paramètres > SLA.`;
  }

  return `${formatCount(outcome.met)} tenus sur ${formatCount(outcome.committed)} ${unit} · ${formatCount(outcome.missed)} hors délai`;
}

function bucketLabel(bucket: "hour" | "day" | "week" | "month"): string {
  if (bucket === "hour") return "heure par heure";
  if (bucket === "week") return "semaine par semaine";
  if (bucket === "month") return "mois par mois";
  return "jour par jour";
}
