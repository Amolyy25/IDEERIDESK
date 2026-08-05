"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Session } from "next-auth";
import type { AgentRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  requireApprovedAgent,
  requirePermission,
} from "@/lib/require-permission";
import { sendAgentApprovalEmail } from "@/lib/gmail-send";
import { recordAudit } from "@/lib/audit";
import type { AuditChange } from "@/lib/audit-actions";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  can,
  effectivePermissions,
  normalizePermissions,
  type PermissionKey,
} from "@/lib/permissions";

// Agents réellement utilisables (assignation d'un ticket, membres d'un
// groupe…) : actifs ET approuvés par un admin.
//
// Garde volontairement large (`requireApprovedAgent` plutôt que « team.view ») :
// c'est la liste qui remplit le sélecteur « Assigné à » d'une fiche ticket et le
// menu des mentions @. Un agent privé de la page Équipe doit quand même pouvoir
// confier un dossier à un collègue.
export async function getAgents() {
  await requireApprovedAgent();
  return prisma.agent.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    orderBy: { name: "asc" },
  });
}

// Tous les comptes, permissions comprises : c'est le contenu de la page Équipe,
// donc « team.view ». Les mutations ci-dessous exigent « team.manage ».
export async function getAllAgents() {
  await requirePermission("team.view");
  return prisma.agent.findMany({ orderBy: { createdAt: "asc" } });
}

export async function countPendingAgents() {
  await requirePermission("team.view");
  return prisma.agent.count({ where: { approvalStatus: "PENDING" } });
}

// ---------------------------------------------------------------------------
// Garde-fous partagés par les mutations
// ---------------------------------------------------------------------------

/**
 * Interdit de se retirer à soi-même de quoi revenir en arrière.
 *
 * Sans ça, un administrateur pouvait se rétrograder en agent d'un clic — et
 * s'il était le seul, l'espace se retrouvait sans personne pour rouvrir quoi
 * que ce soit. Le geste reste possible, mais par un autre compte habilité.
 */
function refuseSelfLockout(session: Session, agentId: string) {
  if (agentId === session.user.id) {
    throw new Error(
      "Vous ne pouvez pas modifier votre propre accès. Demandez-le à un autre administrateur."
    );
  }
}

/**
 * Un compte administrateur ne se modifie que par un administrateur.
 *
 * « team.manage » peut vivre sur un compte qui n'est pas administrateur ;
 * sans cette règle, son porteur désactiverait celui dont il dépend — une
 * élévation de privilèges par la bande, obtenue en retirant les autres plutôt
 * qu'en se donnant quoi que ce soit.
 */
function refuseTouchingAdmin(session: Session, target: { role: AgentRole }) {
  if (target.role === "ADMIN" && session.user.role !== "ADMIN") {
    throw new Error("Seul un administrateur peut modifier le compte d'un administrateur.");
  }
}

/**
 * Refuse de retirer le dernier administrateur actif.
 *
 * Se rétrograder soi-même est déjà bloqué ; il reste le cas de deux
 * administrateurs qui se dégradent l'un l'autre, ou d'un compte désactivé
 * pendant qu'il est le seul restant.
 */
async function refuseLastAdminRemoval(agentId: string, wasAdmin: boolean, stillAdmin: boolean) {
  // Uniquement pour un compte qui perd son rôle : sans ce filtre, la moindre
  // modification d'un agent ordinaire déclenchait le décompte, et une
  // installation sans aucun administrateur refusait toute retouche avec un
  // message hors sujet.
  if (!wasAdmin || stillAdmin) return;

  const otherAdmins = await prisma.agent.count({
    where: {
      id: { not: agentId },
      role: "ADMIN",
      isActive: true,
      approvalStatus: "APPROVED",
    },
  });

  if (otherAdmins === 0) {
    throw new Error(
      "C'est le dernier administrateur actif : nommez-en un autre avant de retirer celui-ci."
    );
  }
}

/**
 * Empêche l'élévation de privilèges.
 *
 * « team.manage » peut être accordé à un agent qui n'est pas administrateur.
 * Sans cette règle, cet agent se donnerait le journal d'audit ou la clé d'API
 * de l'assistant en deux clics : on ne distribue que ce qu'on détient soi-même.
 * Un administrateur porte tout le registre, la règle ne le contraint donc pas.
 */
function refuseEscalation(session: Session, granted: PermissionKey[], current: PermissionKey[]) {
  const added = granted.filter((key) => !current.includes(key));
  const outOfReach = added.filter((key) => !can(session.user.permissions, key));

  if (outOfReach.length > 0) {
    const labels = outOfReach.map((key) => `« ${PERMISSIONS[key].label} »`).join(", ");
    throw new Error(
      `Vous ne pouvez pas accorder une permission que vous n'avez pas vous-même : ${labels}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const permissionsSchema = z.object({
  role: z.enum(["ADMIN", "AGENT"]),
  isActive: z.boolean(),
  requiresApproval: z.boolean(),
  permissions: z.array(z.string()),
});

/**
 * Enregistre rôle, activation, retenue de validation et permissions fines d'un
 * agent.
 *
 * Cinq refus, dans cet ordre : ne pas se verrouiller soi-même, ne pas toucher au
 * compte d'un administrateur sans l'être, ne pas en nommer un sans l'être, ne
 * pas laisser l'espace sans administrateur, ne pas accorder plus que ce qu'on
 * détient. Chacun correspond à une manière concrète de casser l'installation ou
 * d'en prendre le contrôle.
 */
export async function updateAgentPermissions(
  agentId: string,
  input: z.infer<typeof permissionsSchema>
) {
  const session = await requirePermission("team.manage");
  const data = permissionsSchema.parse(input);

  refuseSelfLockout(session, agentId);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    throw new Error("Agent introuvable.");
  }

  refuseTouchingAdmin(session, agent);

  // Nommer ou révoquer un administrateur est le seul geste qu'aucune permission
  // n'accorde : c'est donner l'accès à tout, y compris à ce qui n'existe pas
  // encore. Il reste attaché au rôle.
  if (data.role !== agent.role) {
    await requireAdmin();
  }

  await refuseLastAdminRemoval(
    agentId,
    agent.role === "ADMIN" && agent.isActive,
    data.role === "ADMIN" && data.isActive,
  );

  const permissions = normalizePermissions(data.permissions);
  refuseEscalation(session, permissions, normalizePermissions(agent.permissions));

  // Un administrateur ne stocke aucune permission : son rôle les porte toutes.
  // Les vider à la promotion évite qu'un rétrogradage ultérieur ressuscite une
  // liste figée des mois plus tôt.
  const stored = data.role === "ADMIN" ? [] : permissions;

  const changes = diffAgentAccess(agent, { ...data, permissions: stored });
  if (changes.length === 0) return;

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      role: data.role,
      isActive: data.isActive,
      requiresApproval: data.requiresApproval,
      permissions: stored,
    },
  });

  await recordAudit({
    session,
    action: "AGENT_PERMISSIONS_UPDATED",
    changes,
    summary: agentRef(agent),
  });

  revalidatePath("/agents");
}

/**
 * Tranche une demande d'accès. L'approbation envoie un email au demandeur
 * (silencieusement ignoré si Gmail n'est pas connecté — la décision, elle,
 * est bien enregistrée) ; le refus n'envoie rien, l'intéressé se voit
 * simplement refuser sa prochaine connexion.
 */
export async function setAgentApproval(agentId: string, approved: boolean) {
  const session = await requirePermission("team.manage");
  refuseSelfLockout(session, agentId);

  const target = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { role: true },
  });
  if (!target) {
    throw new Error("Agent introuvable.");
  }
  refuseTouchingAdmin(session, target);

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      approvalStatus: approved ? "APPROVED" : "REJECTED",
      approvalDecidedAt: new Date(),
      approvalDecidedById: session.user.id,
    },
  });

  await recordAudit({
    session,
    action: approved ? "AGENT_ACCESS_GRANTED" : "AGENT_ACCESS_DENIED",
    summary: agentRef(agent),
    // Ce qu'obtient concrètement le compte approuvé : une approbation sans
    // relevé de ses droits ne dit pas grand-chose au relecteur du journal.
    changes: approved ? [{ label: "Permissions à l'approbation", to: accessSummary(agent) }] : [],
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

// ---------------------------------------------------------------------------
// Journalisation
// ---------------------------------------------------------------------------

/** Le compte visé, tel qu'il apparaît dans la colonne « Détail » du journal. */
function agentRef(agent: { name: string; email: string }) {
  return `Compte ${agent.name} (${agent.email})`;
}

/** Droits effectifs en une ligne lisible, pour la trace d'approbation. */
function accessSummary(agent: { role: AgentRole; permissions: string[] }) {
  if (agent.role === "ADMIN") return "Administrateur (toutes les permissions)";
  const granted = effectivePermissions(agent);
  if (granted.length === 0) return "Aucune";
  return granted.map((key) => PERMISSIONS[key].label).join(", ");
}

type AgentAccess = {
  role: AgentRole;
  isActive: boolean;
  requiresApproval: boolean;
  permissions: string[];
};

/**
 * Différentiel des droits, en libellés — jamais en clés techniques.
 *
 * Le journal se relit des mois plus tard, souvent par quelqu'un qui n'a pas le
 * registre sous les yeux : « Répondre et modifier : non → oui » se comprend,
 * « tickets.respond » non.
 */
function diffAgentAccess(before: AgentAccess, after: AgentAccess): AuditChange[] {
  const changes: AuditChange[] = [];
  const yesNo = (value: boolean) => (value ? "oui" : "non");

  if (before.role !== after.role) {
    const label = (role: AgentRole) => (role === "ADMIN" ? "Administrateur" : "Agent");
    changes.push({ label: "Rôle", from: label(before.role), to: label(after.role) });
  }
  if (before.isActive !== after.isActive) {
    changes.push({ label: "Compte actif", from: yesNo(before.isActive), to: yesNo(after.isActive) });
  }
  if (before.requiresApproval !== after.requiresApproval) {
    changes.push({
      label: "Réponses soumises à validation",
      from: yesNo(before.requiresApproval),
      to: yesNo(after.requiresApproval),
    });
  }

  // Comparaison sur les permissions EFFECTIVES : une promotion en
  // administrateur vide la liste stockée tout en accordant tout, un
  // différentiel sur les clés brutes lirait exactement l'inverse.
  const previous = effectivePermissions(before);
  const next = effectivePermissions(after);
  for (const key of PERMISSION_KEYS) {
    const had = previous.includes(key);
    const has = next.includes(key);
    if (had !== has) {
      changes.push({ label: PERMISSIONS[key].label, from: yesNo(had), to: yesNo(has) });
    }
  }

  return changes;
}
