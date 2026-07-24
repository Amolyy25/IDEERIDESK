"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const prioritySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  color: z.string().trim().min(1),
  isDefault: z.boolean(),
});

export async function getTicketPriorities() {
  return prisma.ticketPriority.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketPriority(input: z.infer<typeof prioritySchema>) {
  const data = prioritySchema.parse(input);
  const count = await prisma.ticketPriority.count();

  if (data.isDefault) {
    await prisma.ticketPriority.updateMany({ data: { isDefault: false } });
  }

  await prisma.ticketPriority.create({ data: { ...data, order: count } });
  revalidatePath("/settings/priorities");
}

export async function updateTicketPriority(id: string, input: z.infer<typeof prioritySchema>) {
  const data = prioritySchema.parse(input);

  if (data.isDefault) {
    await prisma.ticketPriority.updateMany({
      data: { isDefault: false },
      where: { id: { not: id } },
    });
  }

  await prisma.ticketPriority.update({ where: { id }, data });
  revalidatePath("/settings/priorities");
}

export async function deleteTicketPriority(id: string) {
  const inUse = await prisma.ticket.count({ where: { priorityId: id } });
  if (inUse > 0) {
    throw new Error("Cette priorité est utilisée par des tickets et ne peut pas être supprimée.");
  }
  await prisma.ticketPriority.delete({ where: { id } });
  revalidatePath("/settings/priorities");
}

export async function reorderTicketPriorities(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketPriority.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/priorities");
}
