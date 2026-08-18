"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/require-permission";
import { agentLabelById, readTicketRef, recordAudit } from "@/lib/audit";
import { replySummary, sendApprovedTicketReply } from "@/lib/ticket-reply";

const pendingApprovalSelect = {
  id: true,
  content: true,
  // La file montre la réponse telle qu'elle partira, mise en forme comprise :
  // c'est ce qui est validé, pas une version aplatie.
  contentHtml: true,
  createdAt: true,
  agent: { select: { id: true, name: true } },
  ticket: {
    select: {
      id: true,
      number: true,
      subject: true,
      client: { select: { name: true } },
    },
  },
} satisfies Prisma.MessageSelect;

export type PendingApprovalMessage = Prisma.MessageGetPayload<{
  select: typeof pendingApprovalSelect;
}>;

// Les plus anciennes d'abord : c'est l'ordre d'attente du client.
export async function getPendingApprovalMessages() {
  await requirePermission("approvals.handle");
  return prisma.message.findMany({
    where: { approvalStatus: "PENDING" },
    select: pendingApprovalSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingApprovalMessages() {
  await requirePermission("approvals.handle");
  return prisma.message.count({ where: { approvalStatus: "PENDING" } });
}

export async function approveMessage(messageId: string) {
  const session = await requirePermission("approvals.handle");

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }
  // Un agent portant à la fois `requiresApproval` et « approvals.handle » pourrait
  // sinon relâcher ses propres réponses, ce qui vide le workflow de son sens.
  if (message.agentId === session.user.id) {
    throw new Error("Un autre agent habilité doit valider votre propre réponse.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      approvalStatus: "APPROVED",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  const result = await sendApprovedTicketReply(
    message.ticketId,
    message.id,
    { content: message.content, html: message.contentHtml },
    message.agentId
  );

  await recordAudit({
    session,
    action: "REPLY_APPROVED",
    ticket: await readTicketRef(message.ticketId),
    // Auteur et valideur sont deux personnes différentes (la garde ci-dessus
    // l'impose) : sans les deux noms, la trace laisse croire que le valideur a
    // écrit la réponse.
    summary: `Validation de la réponse rédigée par ${await agentLabelById(
      message.agentId,
    )}. ${replySummary(result)}`,
  });

  revalidatePath(`/tickets/${message.ticketId}`);
  return result;
}

export async function rejectMessage(messageId: string) {
  const session = await requirePermission("approvals.handle");

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { approvalStatus: "REJECTED" },
  });

  await recordAudit({
    session,
    action: "REPLY_REJECTED",
    ticket: await readTicketRef(message.ticketId),
    summary: `Refus de la réponse rédigée par ${await agentLabelById(
      message.agentId,
    )} — rien n'est parti au client.`,
  });

  revalidatePath(`/tickets/${message.ticketId}`);
}
