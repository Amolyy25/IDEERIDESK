import { getTickets } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getClients } from "@/lib/actions/clients";
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
}>;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;

  const [{ tickets, total, pageSize }, statuses, priorities, categories, agents, clients] =
    await Promise.all([
      getTickets({
        page,
        search: params.search,
        statusId: params.statusId,
        priorityId: params.priorityId,
        categoryId: params.categoryId,
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
