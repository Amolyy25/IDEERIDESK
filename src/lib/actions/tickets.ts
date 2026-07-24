"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { auth } from "@/auth";
import { requireCanApprove } from "@/lib/require-permission";
import type { EmailHistoryEntry } from "@/lib/email-template";

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

const EMAIL_HISTORY_LIMIT = 10;

/**
 * Builds and actually sends the client-facing email for a public reply, then
 * marks the message as sent. Shared by the direct-send path (no approval
 * required) and `approveMessage` (an approver releasing a held reply) so the
 * send logic — including the conversation history — lives in one place.
 */
async function sendApprovedTicketReply(ticketId: string, messageId: string, content: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { client: true } });
  if (!ticket?.client?.email) {
    return { emailSent: false as const, emailSkippedReason: "Aucun client associé à ce ticket." };
  }

  const { senderName } = await getEmailAccountStatus();

  const previousMessages = await prisma.message.findMany({
    where: { ticketId, isPrivate: false, id: { not: messageId } },
    orderBy: { createdAt: "desc" },
    take: EMAIL_HISTORY_LIMIT,
  });

  // Toutes les réponses agent partent au nom façade unique "Ideeri Support"
  // (une seule boîte partagée pour toute l'équipe) — l'historique reprend
  // cette même convention plutôt que de révéler quel agent a écrit quoi.
  const history: EmailHistoryEntry[] = previousMessages
    .map((m) => ({
      authorLabel: m.authorType === "AGENT" ? senderName : ticket.client?.name ?? "Client",
      content: m.content,
      createdAt: m.createdAt,
    }))
    .reverse();

  const result = await sendTicketReplyEmail({
    ticket,
    clientEmail: ticket.client.email,
    senderName,
    bodyText: content,
    history,
  });

  if (result.sent) {
    await prisma.message.update({
      where: { id: messageId },
      data: { emailSent: true, gmailMessageId: result.gmailMessageId },
    });
    revalidatePath(`/tickets/${ticketId}`);
  }

  return { emailSent: result.sent, emailSkippedReason: result.sent ? null : result.error ?? null };
}

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
  if (!session.user.canRespond) {
    throw new Error("Vous n'avez pas la permission de répondre aux tickets (lecture seule).");
  }

  const isPublicAgentReply = !data.isPrivate;
  const needsApproval = isPublicAgentReply && session.user.requiresApproval;

  const message = await prisma.message.create({
    data: {
      ticketId,
      content: data.content,
      authorType: "AGENT",
      agentId,
      isPrivate: data.isPrivate,
      approvalStatus: needsApproval ? "PENDING" : null,
    },
  });
  await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  if (!isPublicAgentReply) {
    return { emailSent: false as const, emailSkippedReason: null, pendingApproval: false };
  }

  if (needsApproval) {
    return { emailSent: false as const, emailSkippedReason: null, pendingApproval: true };
  }

  const sendResult = await sendApprovedTicketReply(ticketId, message.id, data.content);
  return { ...sendResult, pendingApproval: false };
}

export async function approveMessage(messageId: string) {
  const session = await requireCanApprove();

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      approvalStatus: "APPROVED",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  const result = await sendApprovedTicketReply(message.ticketId, message.id, message.content);
  revalidatePath(`/tickets/${message.ticketId}`);
  return result;
}

export async function rejectMessage(messageId: string) {
  await requireCanApprove();

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { approvalStatus: "REJECTED" },
  });
  revalidatePath(`/tickets/${message.ticketId}`);
}
