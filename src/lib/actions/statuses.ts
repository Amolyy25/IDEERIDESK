"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApprovedAgent, requirePermission } from "@/lib/require-permission";
import {
  getStatusDeletionImpacts,
  moveTicketsOffStatus,
} from "@/lib/ticket-attribute-deletion";

const statusSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  color: z.string().trim().min(1),
  isClosed: z.boolean(),
  isDefault: z.boolean(),
  isInProgressDefault: z.boolean(),
  isCloseDefault: z.boolean(),
  isReopenDefault: z.boolean(),
});

export async function getTicketStatuses() {
  await requireApprovedAgent();
  return prisma.ticketStatus.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketStatus(input: z.infer<typeof statusSchema>) {
  await requirePermission("settings.tickets");
  const data = statusSchema.parse(input);
  const count = await prisma.ticketStatus.count();

  if (data.isDefault) {
    await prisma.ticketStatus.updateMany({ data: { isDefault: false } });
  }
  if (data.isInProgressDefault) {
    await prisma.ticketStatus.updateMany({ data: { isInProgressDefault: false } });
  }
  if (data.isCloseDefault) {
    await prisma.ticketStatus.updateMany({ data: { isCloseDefault: false } });
  }
  if (data.isReopenDefault) {
    await prisma.ticketStatus.updateMany({ data: { isReopenDefault: false } });
  }

  await prisma.ticketStatus.create({ data: { ...data, order: count } });
  revalidatePath("/settings/statuses");
}

export async function updateTicketStatus(id: string, input: z.infer<typeof statusSchema>) {
  await requirePermission("settings.tickets");
  const data = statusSchema.parse(input);

  if (data.isDefault) {
    await prisma.ticketStatus.updateMany({
      data: { isDefault: false },
      where: { id: { not: id } },
    });
  }
  if (data.isInProgressDefault) {
    await prisma.ticketStatus.updateMany({
      data: { isInProgressDefault: false },
      where: { id: { not: id } },
    });
  }
  if (data.isCloseDefault) {
    await prisma.ticketStatus.updateMany({
      data: { isCloseDefault: false },
      where: { id: { not: id } },
    });
  }
  if (data.isReopenDefault) {
    await prisma.ticketStatus.updateMany({
      data: { isReopenDefault: false },
      where: { id: { not: id } },
    });
  }

  await prisma.ticketStatus.update({ where: { id }, data });
  revalidatePath("/settings/statuses");
}

// Les tickets ne bloquent plus la suppression : ils passent au statut par défaut,
// ce que le dialogue annonce avant. Ce qui bloque, ce sont les automatisations —
// FK RESTRICT en base, et une règle privée de son statut n'a de toute façon pas
// de réécriture évidente à faire à sa place.
export async function deleteTicketStatus(id: string) {
  await requirePermission("settings.tickets");

  const impact = (await getStatusDeletionImpacts())[id];
  if (!impact) throw new Error("Statut introuvable.");
  if (impact.blockers.length > 0) throw new Error(impact.blockers.join(" "));

  if (impact.ticketCount > 0 && impact.fallbackId) {
    await moveTicketsOffStatus(id, impact.fallbackId);
    revalidatePath("/tickets");
  }

  await prisma.ticketStatus.delete({ where: { id } });
  revalidatePath("/settings/statuses");
}

export async function reorderTicketStatuses(orderedIds: string[]) {
  await requirePermission("settings.tickets");
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketStatus.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/statuses");
}
