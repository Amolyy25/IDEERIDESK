import Link from "next/link";
import { cn } from "@/lib/utils";
import { SLA_BREACHED_FILTER, UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import type { TicketQueueStats } from "@/lib/actions/ticket-counts";

/**
 * Vues de la file, premier bandeau de la carte : les façons dont un agent
 * attaque sa journée, avec le nombre de tickets ouverts derrière chacune.
 *
 * Une vue repart d'une URL propre et abandonne les filtres en cours : c'est ce
 * qu'on attend d'un raccourci, et garder un filtre invisible ferait mentir le
 * compteur affiché.
 *
 * Gouttière `px-4` comme le reste de la carte (barre de filtres, cellules de
 * bord, pied de page) : tout ce qui est empilé partage le même bord gauche.
 */

type View = {
  key: string;
  label: string;
  count: number;
  href: string;
  /** Vrai quand l'URL courante correspond à cette vue. */
  isActive: boolean;
  /** Passe le compteur en rouge : réservé à ce qui appelle une action immédiate. */
  isAlerting?: boolean;
};

export function QueueTabs({
  stats,
  currentAgentId,
  activeAssigneeId,
  activeSla,
  hasSearch,
  groupNames,
}: {
  stats: TicketQueueStats;
  currentAgentId: string | null;
  /** Paramètre `assigneeId` de l'URL, pour marquer la vue courante. */
  activeAssigneeId: string | null;
  /** Paramètre `sla` de l'URL, idem. */
  activeSla: string | null;
  /** Une recherche est en cours dans la liste. */
  hasSearch: boolean;
  /** Produits couverts par les groupes de l'agent, quand le filtre auto s'applique. */
  groupNames: string[];
}) {
  const isBreachedView = activeSla === SLA_BREACHED_FILTER;
  // Aucune vue d'assignation n'est active tant qu'on regarde les retards, même
  // si l'URL ne porte pas d'`assigneeId` : deux onglets soulignés à la fois ne
  // diraient plus ce qu'on est en train de lire.
  //
  // Une recherche non plus : elle traverse tous les statuts, tickets clos
  // compris, et souligner « Ouverts » au-dessus ferait mentir l'onglet.
  const assignee = (value: string | null) =>
    !isBreachedView && !hasSearch && activeAssigneeId === value;

  const views: View[] = [
    { key: "open", label: "Ouverts", count: stats.open, href: "/tickets", isActive: assignee(null) },
    {
      key: "unassigned",
      label: "Non assignés",
      count: stats.unassigned,
      href: `/tickets?assigneeId=${UNASSIGNED_FILTER}`,
      isActive: assignee(UNASSIGNED_FILTER),
    },
  ];

  if (currentAgentId) {
    views.push({
      key: "mine",
      label: "Mes tickets",
      count: stats.mine,
      href: `/tickets?assigneeId=${currentAgentId}`,
      isActive: assignee(currentAgentId),
    });
  }

  // En dernier, et en rouge quand elle n'est pas vide : c'est la seule vue qui
  // désigne un engagement déjà rompu, pas une file à traiter dans l'ordre.
  views.push({
    key: "sla",
    label: "SLA en retard",
    count: stats.breached,
    href: `/tickets?sla=${SLA_BREACHED_FILTER}`,
    isActive: isBreachedView,
    isAlerting: stats.breached > 0,
  });

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 border-b bg-muted/30 px-4">
      <nav className="-mb-px flex h-12 items-stretch gap-6" aria-label="Vues de la file">
        {views.map((view) => (
          <Link
            key={view.key}
            href={view.href}
            aria-current={view.isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              view.isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {view.label}
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                view.isAlerting
                  ? "bg-destructive/10 font-medium text-destructive"
                  : view.isActive
                    ? "bg-primary/15 text-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {view.count}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-muted-foreground">
        {stats.unread > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {stats.unread} non {unreadWord(stats.unread)}
          </span>
        )}

        {groupNames.length > 0 && (
          <span>
            Vos groupes : <span className="text-foreground">{groupNames.join(", ")}</span>{" "}
            <Link
              href="/tickets?scope=all"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              tout voir
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}

function unreadWord(count: number) {
  if (count > 1) return "lus";
  return "lu";
}
