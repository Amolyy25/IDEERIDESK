import Link from "next/link";
import { auth } from "@/auth";
import { getTickets } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getClients } from "@/lib/actions/clients";
import { getAgentDefaultCategoryIds } from "@/lib/actions/groups";
import { DataTable } from "@/components/ui/data-table";
import { ticketColumns } from "@/components/tickets/columns";
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
  const [session, params] = await Promise.all([auth(), searchParams]);
  const page = Number(params.page ?? "1") || 1;

  const hasManualFilter = Boolean(
    params.search || params.statusId || params.priorityId || params.categoryId || params.assigneeId
  );
  const wantsAllScope = params.scope === "all";

  let autoCategoryIds: string[] = [];
  if (!hasManualFilter && !wantsAllScope && session?.user?.id) {
    autoCategoryIds = await getAgentDefaultCategoryIds(session.user.id);
  }

  const [{ tickets, total, pageSize }, statuses, priorities, categories, agents, clients] =
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
      getTicketStatuses(),
      getTicketPriorities(),
      getTicketCategories(),
      getAgents(),
      getClients(),
    ]);

  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const autoFilterActive = autoCategoryIds.length > 0;
  const autoFilterNames = categories
    .filter((c) => autoCategoryIds.includes(c.id))
    .map((c) => c.name)
    .join(", ");

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Suivez et traitez les demandes entrantes.
          </p>
        </div>
        <NewTicketDialog
          statuses={statuses}
          priorities={priorities}
          categories={categories}
          clients={clients}
        />
      </div>

      {autoFilterActive && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm">
          <span className="text-muted-foreground">
            Filtré sur vos groupes : <span className="text-foreground">{autoFilterNames}</span>
          </span>
          <Link href="/tickets?scope=all" className="font-medium text-primary hover:underline">
            Voir tous les tickets
          </Link>
        </div>
      )}

      <TicketsToolbar
        statuses={statuses}
        priorities={priorities}
        categories={categories}
        agents={agents}
      />

      <DataTable columns={ticketColumns} data={tickets} emptyMessage="Aucun ticket pour le moment." />

      <TablePagination page={page} pageCount={pageCount} total={total} />
    </div>
  );
}
