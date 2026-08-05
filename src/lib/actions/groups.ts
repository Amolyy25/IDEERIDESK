"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApprovedAgent, requirePermission } from "@/lib/require-permission";

// Les groupes ne se lisent que depuis la page Équipe. Le pré-filtrage de la
// liste des tickets, lui, passe par `getAgentDefaultCategoryIds` ci-dessous, qui
// reste ouvert à tout agent : un membre privé de la page Équipe doit quand même
// retrouver ses produits.
export async function getGroups() {
  await requirePermission("team.view");
  return prisma.group.findMany({
    include: {
      members: { select: { id: true, name: true, email: true } },
      products: { select: { id: true, name: true, color: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Product (ticket category) ids covered by any group the agent belongs to — used to pre-filter the ticket list. */
export async function getAgentDefaultCategoryIds(agentId: string) {
  await requireApprovedAgent();
  const groups = await prisma.group.findMany({
    where: { members: { some: { id: agentId } } },
    select: { products: { select: { id: true } } },
  });

  const ids = new Set<string>();
  for (const group of groups) {
    for (const product of group.products) ids.add(product.id);
  }
  return Array.from(ids);
}

const groupSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  color: z.string().trim().min(1),
  memberIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
});

export async function createGroup(input: z.infer<typeof groupSchema>) {
  await requirePermission("team.manage");
  const data = groupSchema.parse(input);

  const existing = await prisma.group.findUnique({ where: { name: data.name } });
  if (existing) {
    throw new Error("Un groupe avec ce nom existe déjà.");
  }

  await prisma.group.create({
    data: {
      name: data.name,
      color: data.color,
      members: { connect: data.memberIds.map((id) => ({ id })) },
      products: { connect: data.productIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/agents");
}

export async function updateGroup(id: string, input: z.infer<typeof groupSchema>) {
  await requirePermission("team.manage");
  const data = groupSchema.parse(input);

  await prisma.group.update({
    where: { id },
    data: {
      name: data.name,
      color: data.color,
      members: { set: data.memberIds.map((memberId) => ({ id: memberId })) },
      products: { set: data.productIds.map((productId) => ({ id: productId })) },
    },
  });
  revalidatePath("/agents");
}

export async function deleteGroup(id: string) {
  await requirePermission("team.manage");
  await prisma.group.delete({ where: { id } });
  revalidatePath("/agents");
}
