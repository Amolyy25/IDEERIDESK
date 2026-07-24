"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { auth } from "@/auth";

const ticketInclude = {
  status: true,
  priority: true,
  category: true,
  assignee: true,
  client: true,
} satisfies Prisma.TicketInclude;

export type TicketListItem = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export type TicketWithMessages = Prisma.TicketGetPayload<{
  include: typeof ticketInclude & {
    messages: { include: { agent: true } };
    attachments: { omit: { data: true } };
  };
}>;

export type TicketListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  statusId?: string;
  priorityId?: string;
  categoryId?: string;
  assigneeId?: string;
  sortBy?: "number" | "subject" | "createdAt" | "updatedAt";
  sortDir?: "asc" | "desc";
};

export async function getUnreadTicketCount() {
  return prisma.ticket.count({ where: { hasUnreadActivity: true } });
}

export async function getTickets(filters: TicketListFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir ?? "desc";

  const where: Prisma.TicketWhereInput = {
    statusId: filters.statusId || undefined,
    priorityId: filters.priorityId || undefined,
    categoryId: filters.categoryId || undefined,
    assigneeId: filters.assigneeId || undefined,
    ...(filters.search
      ? {
          OR: [
            { subject: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getTicketById(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      ...ticketInclude,
      messages: {
        include: { agent: true },
        orderBy: { createdAt: "asc" },
      },
      attachments: {
        omit: { data: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function markTicketAsRead(id: string) {
  await prisma.ticket.updateMany({
    where: { id, hasUnreadActivity: true },
    data: { hasUnreadActivity: false },
  });
  revalidatePath("/tickets");
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(1, "Sujet requis").max(200),
  description: z.string().trim().min(1, "Description requise"),
  clientId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  statusId: z.string().min(1),
  priorityId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function createTicket(input: z.infer<typeof createTicketSchema>) {
  const data = createTicketSchema.parse(input);
  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      description: data.description,
      clientId: data.clientId || null,
      categoryId: data.categoryId || null,
      statusId: data.statusId,
      priorityId: data.priorityId,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
  revalidatePath("/tickets");
  return ticket;
}

const updateTicketAttributesSchema = z.object({
  statusId: z.string().optional(),
  priorityId: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function updateTicketAttributes(
  id: string,
  input: z.infer<typeof updateTicketAttributesSchema>
) {
  const data = updateTicketAttributesSchema.parse(input);

  let closedAt: Date | null | undefined = undefined;
  if (data.statusId) {
    const status = await prisma.ticketStatus.findUnique({ where: { id: data.statusId } });
    closedAt = status?.isClosed ? new Date() : null;
  }

  await prisma.ticket.update({
    where: { id },
    data: {
      statusId: data.statusId,
      priorityId: data.priorityId,
      categoryId: data.categoryId === undefined ? undefined : data.categoryId || null,
      assigneeId: data.assigneeId === undefined ? undefined : data.assigneeId || null,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      closedAt,
    },
  });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function deleteTicket(id: string) {
  // Messages et pièces jointes suivent en cascade (onDelete: Cascade côté
  // schéma) — pas de nettoyage manuel à faire ici.
  await prisma.ticket.delete({ where: { id } });
  revalidatePath("/tickets");
}

const addMessageSchema = z.object({
  content: z.string().trim().min(1, "Message vide"),
  isPrivate: z.boolean().default(false),
});

export async function addTicketMessage(
  ticketId: string,
  input: z.infer<typeof addMessageSchema>
) {
  const data = addMessageSchema.parse(input);

  // L'auteur vient toujours de la session, jamais d'une valeur transmise par
  // le client : sinon un agent pourrait faire répondre un collègue à sa place.
  const session = await auth();
  const agentId = session?.user?.id;
  if (!agentId) {
    throw new Error("Vous devez être connecté pour répondre à un ticket.");
  }

  const message = await prisma.message.create({
    data: {
      ticketId,
      content: data.content,
      authorType: "AGENT",
      agentId,
      isPrivate: data.isPrivate,
    },
  });
  await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  const isPublicAgentReply = !data.isPrivate;
  if (!isPublicAgentReply) {
    return { emailSent: false as const, emailSkippedReason: null };
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { client: true } });
  if (!ticket?.client?.email) {
    return { emailSent: false as const, emailSkippedReason: "Aucun client associé à ce ticket." };
  }

  const { senderName } = await getEmailAccountStatus();
  const result = await sendTicketReplyEmail({
    ticket,
    clientEmail: ticket.client.email,
    senderName,
    bodyText: data.content,
  });

  if (result.sent) {
    await prisma.message.update({
      where: { id: message.id },
      data: { emailSent: true, gmailMessageId: result.gmailMessageId },
    });
    revalidatePath(`/tickets/${ticketId}`);
  }

  return { emailSent: result.sent, emailSkippedReason: result.sent ? null : result.error ?? null };
}
