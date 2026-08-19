import { prisma } from "@/lib/prisma";
import { buildTicketListWhere } from "@/lib/ticket-query";

/** La palette se lit d'un coup d'œil : au-delà, on affine le terme plutôt que de défiler. */
const MAX_RESULTS = 8;

export type TicketSearchHit = {
  id: string;
  number: number;
  subject: string;
  clientName: string | null;
  statusName: string;
  statusColor: string;
  isClosed: boolean;
  /** ISO : la donnée traverse le JSON de l'API avant d'être affichée. */
  updatedAt: string;
};

// Mêmes règles de correspondance que la file (`buildTicketListWhere`), pour que
// le même terme trouve la même chose des deux côtés. Un terme fait donc remonter
// les tickets clos, seul endroit où on les retrouve ; sans terme, la palette
// montre les derniers tickets touchés, clos exclus.
export async function searchTickets(term: string): Promise<TicketSearchHit[]> {
  const tickets = await prisma.ticket.findMany({
    where: buildTicketListWhere({ search: term }),
    select: {
      id: true,
      number: true,
      subject: true,
      updatedAt: true,
      client: { select: { name: true } },
      status: { select: { name: true, color: true, isClosed: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_RESULTS,
  });

  return tickets.map((ticket) => ({
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    clientName: ticket.client?.name ?? null,
    statusName: ticket.status.name,
    statusColor: ticket.status.color,
    isClosed: ticket.status.isClosed,
    updatedAt: ticket.updatedAt.toISOString(),
  }));
}
