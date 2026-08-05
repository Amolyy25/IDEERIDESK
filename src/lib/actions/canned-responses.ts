"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApprovedAgent, requireCanRespond } from "@/lib/require-permission";
import {
  dimensionLabel,
  FILTER_DIMENSION_KEYS,
  findUnknownFilterValues,
  loadFilterDimensions,
  type FilterDimensionWithOptions,
} from "@/lib/canned-responses";
import type { CannedResponseDimension } from "@/generated/prisma/client";

const SETTINGS_PATH = "/settings/canned-responses";

/** Une réponse type telle que la page de réglages l'affiche. */
export type CannedResponseWithFilters = {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  autoInsert: boolean;
  filters: { dimension: CannedResponseDimension; valueId: string }[];
};

export async function getCannedResponses(): Promise<CannedResponseWithFilters[]> {
  await requireApprovedAgent();
  return prisma.cannedResponse.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      body: true,
      isActive: true,
      autoInsert: true,
      filters: { select: { dimension: true, valueId: true } },
    },
  });
}

/**
 * Dimensions filtrables et leurs valeurs, pour le formulaire et pour traduire
 * les filtres enregistrés en noms lisibles dans la liste.
 */
export async function getFilterDimensions(): Promise<FilterDimensionWithOptions[]> {
  await requireApprovedAgent();
  return loadFilterDimensions();
}

const cannedResponseSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(120),
  body: z.string().trim().min(1, "Contenu requis").max(10000),
  isActive: z.boolean(),
  autoInsert: z.boolean(),
  filters: z
    .array(
      z.object({
        // Une dimension absente du registre est refusée ici : l'enum Prisma
        // pourrait l'accepter alors que plus aucun code ne sait la filtrer.
        dimension: z.enum(FILTER_DIMENSION_KEYS),
        valueId: z.string().min(1),
      }),
    )
    .default([]),
});

export type CannedResponseInput = z.infer<typeof cannedResponseSchema>;

export async function createCannedResponse(input: CannedResponseInput) {
  await requireCanRespond();
  const data = await parseAndCheck(input, null);

  await prisma.cannedResponse.create({
    data: {
      title: data.title,
      body: data.body,
      isActive: data.isActive,
      autoInsert: data.autoInsert,
      filters: { create: data.filters },
    },
  });
  revalidatePath(SETTINGS_PATH);
}

export async function updateCannedResponse(id: string, input: CannedResponseInput) {
  await requireCanRespond();
  const data = await parseAndCheck(input, id);

  // Les filtres sont remplacés en bloc plutôt que rapprochés un à un : ils n'ont
  // aucune existence propre (pas d'historique, rien qui pointe vers eux), et une
  // réécriture complète évite tout écart entre ce qui est coché et ce qui est
  // stocké. La transaction garantit qu'on ne reste jamais sur une réponse dont
  // les filtres ont été effacés sans être remplacés.
  await prisma.$transaction([
    prisma.cannedResponseFilter.deleteMany({ where: { responseId: id } }),
    prisma.cannedResponse.update({
      where: { id },
      data: {
        title: data.title,
        body: data.body,
        isActive: data.isActive,
        autoInsert: data.autoInsert,
        filters: { create: data.filters },
      },
    }),
  ]);
  revalidatePath(SETTINGS_PATH);
}

export async function deleteCannedResponse(id: string) {
  await requireCanRespond();
  // Les filtres partent avec elle (onDelete: Cascade). Rien d'autre n'y fait
  // référence : une réponse déjà insérée dans un message en est une copie, elle
  // ne dépend plus du modèle.
  await prisma.cannedResponse.delete({ where: { id } });
  revalidatePath(SETTINGS_PATH);
}

/**
 * Valide l'entrée. `currentId` est la réponse en cours de modification, exclue
 * du contrôle d'unicité du titre — sinon elle entrerait en conflit avec
 * elle-même.
 */
async function parseAndCheck(input: CannedResponseInput, currentId: string | null) {
  const data = cannedResponseSchema.parse(input);

  // Deux cases identiques cochées deux fois violeraient la contrainte d'unicité
  // de la table ; l'erreur brute de Postgres serait illisible pour l'agent.
  const filters = deduplicateFilters(data.filters);

  const unknownDimensions = await findUnknownFilterValues(filters);
  if (unknownDimensions.length > 0) {
    const labels = unknownDimensions.map(dimensionLabel).join(", ");
    throw new Error(
      `Une valeur sélectionnée n'existe plus (${labels}) — elle vient d'être supprimée. Rechargez la page.`,
    );
  }

  const sameTitle = await prisma.cannedResponse.findFirst({
    where: { title: data.title, ...excludeCurrent(currentId) },
    select: { id: true },
  });
  if (sameTitle) {
    throw new Error("Une réponse prédéfinie porte déjà ce titre.");
  }

  return { ...data, filters };
}

/** Filtre « toutes les autres réponses » — sans effet à la création. */
function excludeCurrent(currentId: string | null) {
  if (!currentId) return {};
  return { id: { not: currentId } };
}

function deduplicateFilters(filters: CannedResponseInput["filters"]) {
  const seen = new Set<string>();
  const unique: CannedResponseInput["filters"] = [];

  for (const filter of filters) {
    const key = `${filter.dimension}:${filter.valueId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(filter);
  }

  return unique;
}
