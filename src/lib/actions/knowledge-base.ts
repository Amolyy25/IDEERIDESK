"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
});

export async function getKnowledgeCategories() {
  return prisma.knowledgeCategory.findMany({ orderBy: { order: "asc" } });
}

export async function createKnowledgeCategory(input: z.infer<typeof categorySchema>) {
  const data = categorySchema.parse(input);
  const count = await prisma.knowledgeCategory.count();
  await prisma.knowledgeCategory.create({ data: { ...data, order: count } });
  revalidatePath("/knowledge-base/categories");
}

export async function updateKnowledgeCategory(id: string, input: z.infer<typeof categorySchema>) {
  const data = categorySchema.parse(input);
  await prisma.knowledgeCategory.update({ where: { id }, data });
  revalidatePath("/knowledge-base/categories");
}

export async function deleteKnowledgeCategory(id: string) {
  const inUse = await prisma.knowledgeArticle.count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw new Error("Cette catégorie contient des articles et ne peut pas être supprimée.");
  }
  await prisma.knowledgeCategory.delete({ where: { id } });
  revalidatePath("/knowledge-base/categories");
}

// ---------------------------------------------------------------------------
// Modèles d'articles
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  content: z.string().trim().min(1, "Contenu requis"),
});

export async function getArticleTemplates() {
  return prisma.articleTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function createArticleTemplate(input: z.infer<typeof templateSchema>) {
  const data = templateSchema.parse(input);
  await prisma.articleTemplate.create({ data });
  revalidatePath("/knowledge-base/templates");
}

export async function updateArticleTemplate(id: string, input: z.infer<typeof templateSchema>) {
  const data = templateSchema.parse(input);
  await prisma.articleTemplate.update({ where: { id }, data });
  revalidatePath("/knowledge-base/templates");
}

export async function deleteArticleTemplate(id: string) {
  await prisma.articleTemplate.delete({ where: { id } });
  revalidatePath("/knowledge-base/templates");
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(title: string) {
  return title
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "article";
  let slug = base;
  let suffix = 1;
  while (
    await prisma.knowledgeArticle.findFirst({
      where: { slug, id: excludeId ? { not: excludeId } : undefined },
    })
  ) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

const articleSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(200),
  excerpt: z.string().trim().max(300).optional().nullable(),
  content: z.string().trim().min(1, "Contenu requis"),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  categoryId: z.string().optional().nullable(),
});

const articleInclude = { category: true } satisfies Prisma.KnowledgeArticleInclude;

export type KnowledgeArticleListItem = Prisma.KnowledgeArticleGetPayload<{
  include: typeof articleInclude;
}>;

export async function getKnowledgeArticles() {
  return prisma.knowledgeArticle.findMany({
    include: articleInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getKnowledgeArticleById(id: string) {
  return prisma.knowledgeArticle.findUnique({ where: { id }, include: articleInclude });
}

export async function createKnowledgeArticle(input: z.infer<typeof articleSchema>) {
  const data = articleSchema.parse(input);
  const slug = await uniqueSlug(data.title);

  const article = await prisma.knowledgeArticle.create({
    data: {
      title: data.title,
      excerpt: data.excerpt || null,
      content: data.content,
      status: data.status,
      categoryId: data.categoryId || null,
      slug,
      publishedAt: data.status === "PUBLISHED" ? new Date() : null,
    },
  });
  revalidatePath("/knowledge-base");
  return article;
}

export async function updateKnowledgeArticle(id: string, input: z.infer<typeof articleSchema>) {
  const data = articleSchema.parse(input);
  const existing = await prisma.knowledgeArticle.findUniqueOrThrow({ where: { id } });

  const slug = data.title === existing.title ? existing.slug : await uniqueSlug(data.title, id);
  const isNewlyPublished = data.status === "PUBLISHED" && existing.status !== "PUBLISHED";

  await prisma.knowledgeArticle.update({
    where: { id },
    data: {
      title: data.title,
      excerpt: data.excerpt || null,
      content: data.content,
      status: data.status,
      categoryId: data.categoryId || null,
      slug,
      publishedAt: isNewlyPublished ? new Date() : existing.publishedAt,
    },
  });
  revalidatePath("/knowledge-base");
  revalidatePath(`/knowledge-base/${id}`);
}

export async function deleteKnowledgeArticle(id: string) {
  await prisma.knowledgeArticle.delete({ where: { id } });
  revalidatePath("/knowledge-base");
}

export async function getKnowledgeArticleBySlug(slug: string) {
  return prisma.knowledgeArticle.findUnique({ where: { slug }, include: articleInclude });
}

// ---------------------------------------------------------------------------
// FAQ publique (portail, sans connexion) — filtrées côté requête, jamais côté
// rendu : un article DRAFT ne doit jamais transiter vers le navigateur, même
// pour être écarté ensuite.
// ---------------------------------------------------------------------------

export async function getPublishedArticlesByCategory() {
  const categories = await prisma.knowledgeCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      articles: {
        where: { status: "PUBLISHED" },
        select: { id: true, title: true, slug: true, excerpt: true },
        orderBy: { title: "asc" },
      },
    },
  });

  const uncategorized = await prisma.knowledgeArticle.findMany({
    where: { status: "PUBLISHED", categoryId: null },
    select: { id: true, title: true, slug: true, excerpt: true },
    orderBy: { title: "asc" },
  });

  return { categories, uncategorized };
}

export async function getPublishedArticleBySlug(slug: string) {
  return prisma.knowledgeArticle.findFirst({ where: { slug, status: "PUBLISHED" } });
}

// ---------------------------------------------------------------------------
// Partage — un article peut être accessible via un lien à part, choisi au cas
// par cas comme PUBLIC (sans connexion) ou INTERNAL (agents connectés
// uniquement). Pas de lien tant que le partage n'est pas activé. Le lien est
// un slug lisible (dérivé du titre, éditable), pas un token opaque — plus
// simple à partager et à reconnaître qu'un identifiant aléatoire.
// ---------------------------------------------------------------------------

const SHARE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function uniqueShareSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "article";
  let slug = base;
  let suffix = 1;
  while (
    await prisma.knowledgeArticle.findFirst({
      where: { shareToken: slug, id: excludeId ? { not: excludeId } : undefined },
    })
  ) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function generateArticleShareLink(id: string, scope: "PUBLIC" | "INTERNAL") {
  const existing = await prisma.knowledgeArticle.findUniqueOrThrow({ where: { id } });
  const shareToken = existing.shareToken ?? (await uniqueShareSlug(existing.title, id));
  const updated = await prisma.knowledgeArticle.update({
    where: { id },
    data: { shareToken, shareScope: scope },
  });
  revalidatePath(`/knowledge-base/${id}`);
  return { shareToken: updated.shareToken as string };
}

export async function updateArticleShareSlug(id: string, rawSlug: string) {
  const slug = rawSlug.trim().toLowerCase();
  if (!SHARE_SLUG_PATTERN.test(slug)) {
    throw new Error("Lien invalide : lettres minuscules, chiffres et tirets uniquement.");
  }
  const conflict = await prisma.knowledgeArticle.findFirst({
    where: { shareToken: slug, id: { not: id } },
  });
  if (conflict) {
    throw new Error("Ce lien est déjà utilisé par un autre article.");
  }
  const updated = await prisma.knowledgeArticle.update({
    where: { id },
    data: { shareToken: slug },
  });
  revalidatePath(`/knowledge-base/${id}`);
  return { shareToken: updated.shareToken as string };
}

export async function revokeArticleShareLink(id: string) {
  await prisma.knowledgeArticle.update({
    where: { id },
    data: { shareToken: null, shareScope: null },
  });
  revalidatePath(`/knowledge-base/${id}`);
}

export async function getArticleByShareToken(token: string) {
  return prisma.knowledgeArticle.findUnique({ where: { shareToken: token } });
}

// ---------------------------------------------------------------------------
// Recherche (widget public + assistant IA) — uniquement les articles publiés
// ---------------------------------------------------------------------------

export type PublicKnowledgeArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
};

export async function searchPublishedArticles(
  query: string,
  limit = 5
): Promise<PublicKnowledgeArticle[]> {
  const keywords = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 3)
    .slice(0, 8);

  if (keywords.length === 0) return [];

  const matches = await prisma.knowledgeArticle.findMany({
    where: {
      status: "PUBLISHED",
      OR: keywords.flatMap((word) => [
        { title: { contains: word, mode: "insensitive" as const } },
        { content: { contains: word, mode: "insensitive" as const } },
      ]),
    },
    select: { id: true, title: true, excerpt: true, content: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return matches;
}
