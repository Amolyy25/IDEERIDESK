"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApprovedAgent, requirePermission } from "@/lib/require-permission";
import {
  getPriorityDeletionImpacts,
  moveTicketsOffPriority,
} from "@/lib/ticket-attribute-deletion";

const prioritySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  color: z.string().trim().min(1),
  isDefault: z.boolean(),
});

export async function getTicketPriorities() {
  await requireApprovedAgent();
  return prisma.ticketPriority.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketPriority(input: z.infer<typeof prioritySchema>) {
  await requirePermission("settings.tickets");
  const data = prioritySchema.parse(input);
  const count = await prisma.ticketPriority.count();

  if (data.isDefault) {
    await prisma.ticketPriority.updateMany({ data: { isDefault: false } });
  }

  await prisma.ticketPriority.create({ data: { ...data, order: count } });
  revalidatePath("/settings/priorities");
}

export async function updateTicketPriority(id: string, input: z.infer<typeof prioritySchema>) {
  await requirePermission("settings.tickets");
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

// Même règle que les statuts : les tickets suivent la priorité par défaut, seules
// les automatisations font barrage. Voir `deleteTicketStatus`.
export async function deleteTicketPriority(id: string) {
  await requirePermission("settings.tickets");

  const impact = (await getPriorityDeletionImpacts())[id];
  if (!impact) throw new Error("Priorité introuvable.");
  if (impact.blockers.length > 0) throw new Error(impact.blockers.join(" "));

  if (impact.ticketCount > 0 && impact.fallbackId) {
    await moveTicketsOffPriority(id, impact.fallbackId);
    revalidatePath("/tickets");
  }

  await prisma.ticketPriority.delete({ where: { id } });
  revalidatePath("/settings/priorities");
}

export async function reorderTicketPriorities(orderedIds: string[]) {
  await requirePermission("settings.tickets");
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketPriority.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/priorities");
}
