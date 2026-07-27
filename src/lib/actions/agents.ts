"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { sendAgentApprovalEmail } from "@/lib/gmail-send";

// Agents réellement utilisables (assignation d'un ticket, membres d'un
// groupe…) : actifs ET approuvés par un admin.
export async function getAgents() {
  return prisma.agent.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    orderBy: { name: "asc" },
  });
}

// Lecture ouverte à tout agent connecté (la page /agents est consultable par
// tous) — seules les mutations (`updateAgentPermissions`) sont admin-only.
export async function getAllAgents() {
  return prisma.agent.findMany({ orderBy: { createdAt: "asc" } });
}

export async function countPendingAgents() {
  return prisma.agent.count({ where: { approvalStatus: "PENDING" } });
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
  revalidatePath("/agents");
}

/**
 * Tranche une demande d'accès. L'approbation envoie un email au demandeur
 * (silencieusement ignoré si Gmail n'est pas connecté — la décision, elle,
 * est bien enregistrée) ; le refus n'envoie rien, l'intéressé se voit
 * simplement refuser sa prochaine connexion.
 */
export async function setAgentApproval(agentId: string, approved: boolean) {
  const session = await requireAdmin();

  if (agentId === session.user.id) {
    throw new Error("Vous ne pouvez pas modifier votre propre approbation.");
  }

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      approvalStatus: approved ? "APPROVED" : "REJECTED",
      approvalDecidedAt: new Date(),
      approvalDecidedById: session.user.id,
    },
  });

  let emailSent = false;
  if (approved) {
    const result = await sendAgentApprovalEmail({
      to: agent.email,
      agentName: agent.name,
    });
    emailSent = result.sent;
  }

  revalidatePath("/agents");
  return { emailSent };
}
