"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  description: z.string().trim().max(200).optional().nullable(),
  color: z.string().trim().min(1),
  isDefault: z.boolean(),
});

export async function getTicketCategories() {
  return prisma.ticketCategory.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketCategory(input: z.infer<typeof categorySchema>) {
  const data = categorySchema.parse(input);
  const count = await prisma.ticketCategory.count();

  if (data.isDefault) {
    await prisma.ticketCategory.updateMany({ data: { isDefault: false } });
  }

  await prisma.ticketCategory.create({ data: { ...data, order: count } });
  revalidatePath("/settings/categories");
}

export async function updateTicketCategory(id: string, input: z.infer<typeof categorySchema>) {
  const data = categorySchema.parse(input);

  if (data.isDefault) {
    await prisma.ticketCategory.updateMany({
      data: { isDefault: false },
      where: { id: { not: id } },
    });
  }

  await prisma.ticketCategory.update({ where: { id }, data });
  revalidatePath("/settings/categories");
}

export async function deleteTicketCategory(id: string) {
  const inUse = await prisma.ticket.count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw new Error("Ce produit concerné est utilisé par des tickets et ne peut pas être supprimé.");
  }
  await prisma.ticketCategory.delete({ where: { id } });
  revalidatePath("/settings/categories");
}

export async function reorderTicketCategories(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketCategory.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/categories");
}
