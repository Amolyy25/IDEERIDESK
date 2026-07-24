"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";

export async function getAgents() {
  return prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

// Lecture ouverte à tout agent connecté (la page /agents est consultable par
// tous) — seules les mutations (`updateAgentPermissions`) sont admin-only.
export async function getAllAgents() {
  return prisma.agent.findMany({ orderBy: { createdAt: "asc" } });
}

const permissionsSchema = z.object({
  role: z.enum(["ADMIN", "AGENT"]),
  isActive: z.boolean(),
  canRespond: z.boolean(),
  requiresApproval: z.boolean(),
  canApprove: z.boolean(),
});

export async function updateAgentPermissions(
  agentId: string,
  input: z.infer<typeof permissionsSchema>
) {
  const session = await requireAdmin();
  const data = permissionsSchema.parse(input);

  if (agentId === session.user.id && !data.isActive) {
    throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
  }

  await prisma.agent.update({ where: { id: agentId }, data });
  revalidatePath("/settings/agents");
}
