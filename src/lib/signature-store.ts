import { prisma } from "@/lib/prisma";
import { fillSignatureVariables, signatureVariablesForAgent } from "@/lib/signature";

/**
 * Signature à ajouter à une réponse, pour un agent donné.
 *
 * Séparé des Server Actions (`lib/actions/signatures.ts`, réservées aux admins)
 * comme le gabarit d'habillage : une réponse peut partir depuis un contexte sans
 * admin connecté (validation par un collègue, envoi différé).
 *
 * Ordre de priorité, volontairement le plus simple qui réponde au besoin :
 *
 * 1. la signature nominative de l'agent (portée SPECIFIC_AGENTS) ;
 * 2. sinon la signature de toute l'équipe (portée ALL_AGENTS) ;
 * 3. sinon rien — l'email part sans signature, comme avant ce réglage.
 *
 * Les signatures inactives sont ignorées, et un agent ne peut pas être couvert
 * par deux signatures actives de même portée (garanti à l'enregistrement) :
 * `findFirst` ne tranche donc jamais entre deux candidates légitimes.
 */
export async function resolveSignatureHtmlForAgent(agentId: string | null) {
  if (!agentId) return null;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { name: true, email: true },
  });
  if (!agent) return null;

  const signature = await findSignatureForAgent(agentId);
  if (!signature) return null;

  return fillSignatureVariables(signature.bodyHtml, signatureVariablesForAgent(agent));
}

async function findSignatureForAgent(agentId: string) {
  const assigned = await prisma.emailSignature.findFirst({
    where: {
      isActive: true,
      scope: "SPECIFIC_AGENTS",
      agents: { some: { id: agentId } },
    },
    select: { bodyHtml: true },
  });
  if (assigned) return assigned;

  return prisma.emailSignature.findFirst({
    where: { isActive: true, scope: "ALL_AGENTS" },
    select: { bodyHtml: true },
  });
}
