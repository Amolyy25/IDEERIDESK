"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/require-permission";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";
import { hostInlineEmailImages } from "@/lib/email-images";

const signatureInclude = {
  agents: { select: { id: true, name: true }, orderBy: { name: "asc" } },
} satisfies Prisma.EmailSignatureInclude;

export type EmailSignatureWithAgents = Prisma.EmailSignatureGetPayload<{
  include: typeof signatureInclude;
}>;

export async function getEmailSignatures() {
  await requirePermission("settings.email");
  return prisma.emailSignature.findMany({
    include: signatureInclude,
    // Les signatures nominatives après celle de toute l'équipe : c'est l'ordre
    // dans lequel elles s'appliquent (voir `signature-store.ts`).
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });
}

const signatureSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  bodyHtml: z.string().trim().min(1, "Contenu requis").max(20000),
  scope: z.enum(["ALL_AGENTS", "SPECIFIC_AGENTS"]),
  agentIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

type SignatureInput = z.infer<typeof signatureSchema>;

export async function createEmailSignature(input: SignatureInput) {
  await requirePermission("settings.email");
  const data = await parseAndCheck(input, null);

  await prisma.emailSignature.create({
    data: {
      name: data.name,
      bodyHtml: data.bodyHtml,
      scope: data.scope,
      isActive: data.isActive,
      agents: { connect: data.agentIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/settings/signatures");
}

export async function updateEmailSignature(id: string, input: SignatureInput) {
  await requirePermission("settings.email");
  const data = await parseAndCheck(input, id);

  await prisma.emailSignature.update({
    where: { id },
    data: {
      name: data.name,
      bodyHtml: data.bodyHtml,
      scope: data.scope,
      isActive: data.isActive,
      // `set` et non `connect` : les agents décochés doivent être retirés.
      agents: { set: data.agentIds.map((agentId) => ({ id: agentId })) },
    },
  });
  revalidatePath("/settings/signatures");
}

export async function deleteEmailSignature(id: string) {
  await requirePermission("settings.email");
  await prisma.emailSignature.delete({ where: { id } });
  revalidatePath("/settings/signatures");
}

/**
 * Valide l'entrée et refuse tout ce qui rendrait la signature d'un agent
 * ambiguë. `currentId` est la signature en cours de modification, exclue des
 * contrôles — sinon elle entrerait en conflit avec elle-même.
 *
 * Le refus est explicite plutôt que silencieux : désactiver d'office la
 * signature concurrente ferait disparaître un réglage sans que personne ne
 * l'ait demandé.
 */
async function parseAndCheck(input: SignatureInput, currentId: string | null) {
  const data = signatureSchema.parse(input);

  // Hébergement avant nettoyage : le bouton d'insertion passe déjà par
  // /api/signatures/images, mais une image simplement collée arrive en `data:`,
  // que le nettoyage refuse — elle disparaîtrait sans laisser de trace.
  const hosted = await hostInlineEmailImages(data.bodyHtml);
  // Inséré tel quel dans l'email : profil « email », qui conserve les styles
  // inline nécessaires à la mise en forme.
  const bodyHtml = sanitizeEmailHtml(hosted);
  if (!bodyHtml) {
    throw new Error("Le contenu de la signature est vide après nettoyage du HTML.");
  }

  // Une signature de toute l'équipe n'a pas de destinataires nommés : la liste
  // est vidée ici, pas seulement masquée dans le formulaire.
  let agentIds = Array.from(new Set(data.agentIds));
  if (data.scope === "ALL_AGENTS") {
    agentIds = [];
  }

  if (data.scope === "SPECIFIC_AGENTS") {
    if (agentIds.length === 0) {
      throw new Error("Choisissez au moins un agent, ou appliquez la signature à toute l'équipe.");
    }
    // Sans ce contrôle, un identifiant obsolète (compte supprimé entre-temps)
    // ressortirait en erreur brute de la base plutôt qu'en message lisible.
    const known = await prisma.agent.count({ where: { id: { in: agentIds } } });
    if (known !== agentIds.length) {
      throw new Error("Un des agents sélectionnés n'existe plus. Rechargez la page.");
    }
  }

  const sameName = await prisma.emailSignature.findFirst({
    where: { name: data.name, ...excludeCurrent(currentId) },
    select: { id: true },
  });
  if (sameName) {
    throw new Error("Une signature porte déjà ce nom.");
  }

  // Les conflits ne concernent que les signatures actives : une signature mise
  // en pause ne s'applique à personne, elle peut donc doubler une autre.
  if (data.isActive) {
    await assertNoConflict({ scope: data.scope, agentIds, currentId });
  }

  return { ...data, bodyHtml, agentIds };
}

/** Filtre « toutes les autres signatures » — sans effet à la création. */
function excludeCurrent(currentId: string | null): Prisma.EmailSignatureWhereInput {
  if (!currentId) return {};
  return { id: { not: currentId } };
}

async function assertNoConflict({
  scope,
  agentIds,
  currentId,
}: {
  scope: SignatureInput["scope"];
  agentIds: string[];
  currentId: string | null;
}) {
  if (scope === "ALL_AGENTS") {
    const existing = await prisma.emailSignature.findFirst({
      where: { isActive: true, scope: "ALL_AGENTS", ...excludeCurrent(currentId) },
      select: { name: true },
    });
    if (existing) {
      throw new Error(
        `« ${existing.name} » s'applique déjà à toute l'équipe. Mettez-la en pause, ou limitez celle-ci à certains agents.`
      );
    }
    return;
  }

  const overlapping = await prisma.emailSignature.findMany({
    where: {
      isActive: true,
      scope: "SPECIFIC_AGENTS",
      ...excludeCurrent(currentId),
      agents: { some: { id: { in: agentIds } } },
    },
    select: { name: true, agents: { select: { id: true, name: true } } },
  });

  const alreadyCovered: string[] = [];
  for (const signature of overlapping) {
    for (const agent of signature.agents) {
      if (agentIds.includes(agent.id)) {
        alreadyCovered.push(`${agent.name} (« ${signature.name} »)`);
      }
    }
  }

  if (alreadyCovered.length > 0) {
    throw new Error(
      `Ces agents ont déjà une signature nominative : ${alreadyCovered.join(", ")}. Retirez-les de l'autre signature d'abord.`
    );
  }
}
