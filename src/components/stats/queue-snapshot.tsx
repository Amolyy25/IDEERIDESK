import Link from "next/link";
import { formatCount } from "@/lib/stats-format";
import { SLA_BREACHED_FILTER, UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import type { StatsReport } from "@/lib/statistics";

/**
 * L'état de la file à l'instant du chargement — la seule partie de la page qui
 * ignore la période choisie.
 *
 * Séparée des tuiles de période, et pas seulement rangée à part : « 12 tickets en
 * attente » ne veut rien dire appliqué à mars dernier, la file d'alors n'existe
 * plus. Les mélanger était le piège principal de cet écran ; l'intitulé de la
 * carte le dit, et aucun de ces chiffres ne porte d'écart avec une période
 * précédente.
 *
 * Chaque chiffre qui correspond à une vue de la file y renvoie : on ne vient pas
 * lire « 7 non assignés » pour le noter, on vient pour aller les traiter.
 */
export function QueueSnapshot({ now }: { now: StatsReport["now"] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
      <Figure label="Tickets ouverts" value={now.open} href="/tickets?scope=all" />
      <Figure label="Sans première réponse" value={now.awaitingReply} />
      <Figure
        label="Non assignés"
        value={now.unassigned}
        href={`/tickets?assigneeId=${UNASSIGNED_FILTER}&scope=all`}
      />
      <Figure
        label="Échéance dépassée"
        value={now.breached}
        href={`/tickets?sla=${SLA_BREACHED_FILTER}&scope=all`}
        alert={now.breached > 0}
      />
      <Figure label="Horloge en pause" value={now.slaPaused} />
      <Figure label="Tickets depuis l'origine" value={now.totalEverCreated} />
    </div>
  );
}

function Figure({
  label,
  value,
  href,
  alert = false,
}: {
  label: string;
  value: number;
  href?: string;
  alert?: boolean;
}) {
  const content = (
    <>
      <span className="block truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={
          alert
            ? "block text-xl font-semibold tracking-tight text-destructive"
            : "block text-xl font-semibold tracking-tight"
        }
      >
        {formatCount(value)}
      </span>
    </>
  );

  if (!href) return <p className="min-w-0">{content}</p>;

  return (
    <Link href={href} className="min-w-0 hover:opacity-80">
      {content}
      <span className="sr-only">— ouvrir la file correspondante</span>
    </Link>
  );
}
