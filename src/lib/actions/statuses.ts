"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  color: z.string().trim().min(1),
  isClosed: z.boolean(),
  isDefault: z.boolean(),
  isInProgressDefault: z.boolean(),
  isCloseDefault: z.boolean(),
});

export async function getTicketStatuses() {
  return prisma.ticketStatus.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketStatus(input: z.infer<typeof statusSchema>) {
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

  await prisma.ticketStatus.create({ data: { ...data, order: count } });
  revalidatePath("/settings/statuses");
}

export async function updateTicketStatus(id: string, input: z.infer<typeof statusSchema>) {
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

  await prisma.ticketStatus.update({ where: { id }, data });
  revalidatePath("/settings/statuses");
}

export async function deleteTicketStatus(id: string) {
  const inUse = await prisma.ticket.count({ where: { statusId: id } });
  if (inUse > 0) {
    throw new Error("Ce statut est utilisé par des tickets et ne peut pas être supprimé.");
  }
  await prisma.ticketStatus.delete({ where: { id } });
  revalidatePath("/settings/statuses");
}

export async function reorderTicketStatuses(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketStatus.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/statuses");
}
