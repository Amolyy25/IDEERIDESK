"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireApprovedAgent } from "@/lib/require-permission";
import {
  fieldKeyFromLabel,
  isDecorativeField,
  isPersistedFieldId,
  slugifySource,
  sourceConfigSchema,
  type SourceConfig,
  type SourceFormField,
  type SourceFormRendering,
} from "@/lib/sources";
import type { Prisma, Source, SourceField } from "@/generated/prisma/client";

export type SourceListItem = Source & {
  _count: { fields: number; tickets: number };
};

export type SourceWithFields = Source & { fields: SourceField[] };

function toOptions(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((option): option is string => typeof option === "string");
}

/** Traduit une source de la base vers le contrat édité par le form builder. */
function toConfig(source: SourceWithFields): SourceConfig {
  return {
    name: source.name,
    slug: source.slug,
    description: source.description,
    isActive: source.isActive,
    ticketSource: source.ticketSource,
    logoUrl: source.logoUrl,
    formTitle: source.formTitle,
    formDescription: source.formDescription,
    submitLabel: source.submitLabel,
    successMessage: source.successMessage,
    showCategoryField: source.showCategoryField,
    allowAttachments: source.allowAttachments,
    showBannerMessage: source.showBannerMessage,
    useGlobalCustomFields: source.useGlobalCustomFields,
    fields: source.fields.map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      placeholder: field.placeholder,
      helpText: field.helpText,
      isRequired: field.isRequired,
      options: toOptions(field.options),
    })),
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getSources(): Promise<SourceListItem[]> {
  await requireAdmin();
  return prisma.source.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { fields: true, tickets: true } } },
  });
}

export async function getSourceConfig(id: string): Promise<SourceConfig | null> {
  await requireAdmin();
  const source = await prisma.source.findUnique({
    where: { id },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  return source ? toConfig(source) : null;
}

export type SourceFormPayload = SourceFormRendering & {
  slug: string;
  useGlobalCustomFields: boolean;
};

/**
 * Configuration servie au formulaire public (/widget, portail). Aucun contrôle
 * d'accès : le paramétrage d'un formulaire est par nature visible de ses
 * visiteurs. Une source désactivée ne renvoie rien.
 */
export async function getSourceForm(slug: string): Promise<SourceFormPayload | null> {
  const source = await prisma.source.findFirst({
    where: { slug, isActive: true },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!source) return null;

  const config = toConfig(source);
  const keyById = new Map(source.fields.map((field) => [field.id, field.key]));

  return {
    slug: source.slug,
    useGlobalCustomFields: config.useGlobalCustomFields,
    logoUrl: config.logoUrl,
    formTitle: config.formTitle,
    formDescription: config.formDescription,
    submitLabel: config.submitLabel,
    successMessage: config.successMessage,
    showCategoryField: config.showCategoryField,
    allowAttachments: config.allowAttachments,
    showBannerMessage: config.showBannerMessage,
    fields: config.fields.map((field) => ({ ...field, key: keyById.get(field.id) ?? field.id })),
  };
}

/** Champs d'une source, pour afficher les réponses sur la fiche d'un ticket. */
export async function getSourceFields(sourceId: string): Promise<SourceField[]> {
  await requireApprovedAgent();
  return prisma.sourceField.findMany({
    where: { sourceId },
    orderBy: { order: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function revalidateSources(id?: string) {
  revalidatePath("/settings/sources");
  if (id) revalidatePath(`/settings/sources/${id}`);
  revalidatePath("/widget");
}

/**
 * Crée une source à partir de son seul nom : le formulaire hérite des valeurs
 * par défaut du schéma Prisma, l'admin le personnalise ensuite dans le builder.
 */
export async function createSource(input: { name: string; description?: string | null }) {
  await requireAdmin();

  const name = input.name.trim();
  if (!name) throw new Error("Nom requis.");

  const slug = slugifySource(name);
  if (!slug) {
    throw new Error("Nom invalide : impossible d'en dériver un identifiant.");
  }

  const clash = await prisma.source.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (clash) {
    throw new Error("Une source portant ce nom existe déjà.");
  }

  const source = await prisma.source.create({
    data: {
      name,
      slug,
      description: input.description?.trim() || null,
    },
  });

  revalidateSources(source.id);
  return { id: source.id, slug: source.slug };
}

/**
 * Enregistre la configuration complète d'une source (branding + champs).
 *
 * Les champs sont réconciliés par id : ceux déjà en base gardent leur `key`
 * (donc les réponses déjà collectées restent lisibles même si le libellé
 * change), ceux absents du payload sont supprimés.
 */
export async function updateSource(id: string, input: unknown) {
  await requireAdmin();
  const data = sourceConfigSchema.parse(input);

  const existing = await prisma.source.findUnique({
    where: { id },
    include: { fields: true },
  });
  if (!existing) throw new Error("Source introuvable.");

  const clash = await prisma.source.findFirst({
    where: { id: { not: id }, OR: [{ name: data.name }, { slug: data.slug }] },
  });
  if (clash) {
    throw new Error("Une autre source utilise déjà ce nom ou cet identifiant.");
  }

  const existingById = new Map(existing.fields.map((field) => [field.id, field]));
  const takenKeys = new Set(existing.fields.map((field) => field.key));

  // Une clé stable et unique par source : le libellé peut être dupliqué ou
  // renommé sans casser les réponses déjà stockées dans `Ticket.metadata`.
  function resolveKey(field: SourceFormField, index: number) {
    const persisted = existingById.get(field.id);
    if (persisted) return persisted.key;

    const base = fieldKeyFromLabel(field.label) || `champ_${index + 1}`;
    let key = base;
    let suffix = 2;
    while (takenKeys.has(key)) {
      key = `${base}_${suffix++}`;
    }
    return key;
  }

  const resolved = data.fields.map((field, index) => {
    const key = resolveKey(field, index);
    takenKeys.add(key);
    const decorative = isDecorativeField(field.type);
    return {
      field,
      key,
      row: {
        type: field.type,
        label: field.label,
        key,
        placeholder: decorative ? null : field.placeholder || null,
        helpText: field.helpText || null,
        isRequired: decorative ? false : field.isRequired,
        options: (field.type === "SELECT" ? field.options : []) as Prisma.InputJsonValue,
        order: index,
      },
    };
  });

  const keptIds = resolved.map(({ field }) => field.id).filter(isPersistedFieldId);

  await prisma.$transaction([
    prisma.sourceField.deleteMany({
      where: { sourceId: id, id: { notIn: keptIds.length ? keptIds : ["__none__"] } },
    }),
    ...resolved.map(({ field, row }) =>
      existingById.has(field.id)
        ? prisma.sourceField.update({ where: { id: field.id }, data: row })
        : prisma.sourceField.create({ data: { ...row, sourceId: id } }),
    ),
    prisma.source.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        isActive: data.isActive,
        ticketSource: data.ticketSource,
        logoUrl: data.logoUrl || null,
        formTitle: data.formTitle,
        formDescription: data.formDescription || null,
        submitLabel: data.submitLabel,
        successMessage: data.successMessage || null,
        showCategoryField: data.showCategoryField,
        allowAttachments: data.allowAttachments,
        showBannerMessage: data.showBannerMessage,
        useGlobalCustomFields: data.useGlobalCustomFields,
      },
    }),
  ]);

  revalidateSources(id);
}

export async function setSourceActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.source.update({ where: { id }, data: { isActive } });
  revalidateSources(id);
}

/**
 * Supprime une source et son formulaire. Les tickets déjà créés sont conservés
 * (leur rattachement passe simplement à null, cf. `onDelete: SetNull`).
 */
export async function deleteSource(id: string) {
  await requireAdmin();
  await prisma.source.delete({ where: { id } });
  revalidateSources();
}
