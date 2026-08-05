import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";
import { getTickets, getTicketQueueStats } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getClients } from "@/lib/actions/clients";
import { getAgentDefaultCategoryIds } from "@/lib/actions/groups";
import { QueueTabs } from "@/components/tickets/queue-tabs";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { TicketsToolbar } from "@/components/tickets/tickets-toolbar";
import { TablePagination } from "@/components/tickets/table-pagination";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";

type SearchParams = Promise<{
  page?: string;
  search?: string;
  statusId?: string;
  priorityId?: string;
  categoryId?: string;
  assigneeId?: string;
  sortBy?: string;
  sortDir?: string;
  scope?: string;
}>;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [session, params] = await Promise.all([requirePageAccess("tickets.view"), searchParams]);
  const page = Number(params.page ?? "1") || 1;

  const canRespond = can(session.user.permissions, "tickets.respond");

  const hasManualFilter = Boolean(
    params.search || params.statusId || params.priorityId || params.categoryId || params.assigneeId
  );
  const wantsAllScope = params.scope === "all";

  // Produits couverts par les groupes de l'agent. La bande de vues s'y tient
  // toujours — c'est « sa » journée, elle ne doit pas changer de périmètre parce
  // qu'il tape une recherche. La liste, elle, s'ouvre à tout dès qu'un filtre
  // manuel est posé : un filtre explicite prime sur le périmètre implicite.
  let agentCategoryIds: string[] = [];
  if (!wantsAllScope && session?.user?.id) {
    agentCategoryIds = await getAgentDefaultCategoryIds(session.user.id);
  }

  let autoCategoryIds: string[] = [];
  if (!hasManualFilter) {
    autoCategoryIds = agentCategoryIds;
  }

  const [{ tickets, total, pageSize }, stats, statuses, priorities, categories, agents, clients] =
    await Promise.all([
      getTickets({
        page,
        search: params.search,
        statusId: params.statusId,
        priorityId: params.priorityId,
        categoryId: params.categoryId,
        categoryIds: autoCategoryIds,
        assigneeId: params.assigneeId,
        sortBy: params.sortBy as never,
        sortDir: params.sortDir as never,
      }),
      getTicketQueueStats({
        agentId: session?.user?.id ?? null,
        categoryIds: agentCategoryIds,
      }),
      getTicketStatuses(),
      getTicketPriorities(),
      getTicketCategories(),
      getAgents(),
      // Le répertoire n'alimente que le sélecteur « Client » du formulaire de
      // création, où il est facultatif : sans la permission, la liste est vide
      // et le reste de la page fonctionne à l'identique.
      can(session.user.permissions, "clients.view") ? getClients() : Promise.resolve([]),
    ]);

  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const groupNames = categories
    .filter((category) => autoCategoryIds.includes(category.id))
    .map((category) => category.name);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-muted/20 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">Suivez et traitez les demandes entrantes.</p>
        </div>
        {canRespond && (
          <NewTicketDialog
            statuses={statuses}
            priorities={priorities}
            categories={categories}
            clients={clients}
          />
        )}
      </div>

      {/* Un seul objet plutôt que trois blocs flottants : vues, filtres, file et
          pagination partagent le même cadre et la même gouttière `px-4`. La
          carte prend la hauteur restante et défile sur elle-même, ce qui garde
          la pagination visible et évite la grande zone vide en bas de page
          quand la file est courte. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-xs">
        <QueueTabs
          stats={stats}
          currentAgentId={session?.user?.id ?? null}
          activeAssigneeId={params.assigneeId ?? null}
          groupNames={groupNames}
        />

        <TicketsToolbar
          statuses={statuses}
          priorities={priorities}
          categories={categories}
          agents={agents}
          currentAgentId={session?.user?.id ?? null}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <TicketsTable
            tickets={tickets}
            priorities={priorities}
            hasActiveFilters={hasManualFilter}
          />
        </div>

        <TablePagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} />
      </div>
    </div>
  );
}
