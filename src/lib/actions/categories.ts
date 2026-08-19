"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import {
  clearCategoryOnTickets,
  getCategoryDeletionImpacts,
} from "@/lib/ticket-attribute-deletion";

/**
 * Assez pour couvrir les variantes d'écriture d'un produit (nom commercial,
 * faute courante, nom de domaine) sans qu'une liste devienne un filet à
 * faux positifs que plus personne ne relit.
 */
const MAX_EMAIL_KEYWORDS = 30;
const MAX_EMAIL_KEYWORD_LENGTH = 60;

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  description: z.string().trim().max(200).optional().nullable(),
  color: z.string().trim().min(1),
  isDefault: z.boolean(),
  // Mots qui désignent ce produit dans un email entrant — voir
  // `detectProductFromEmail`. Optionnel : un produit sans mot-clé n'est
  // simplement jamais posé automatiquement.
  emailKeywords: z.array(z.string().max(MAX_EMAIL_KEYWORD_LENGTH)).optional(),
});

/**
 * Un mot-clé vide se comporterait comme un joker : il rattacherait *tous* les
 * emails à son produit. Les doublons, eux, ne changent rien au résultat mais
 * font croire à un réglage plus fin qu'il ne l'est — ils sont donc écartés à
 * l'écriture, sur la même comparaison hors casse et hors accents que celle qui
 * lit les emails, pour que « Papiris » et « papiris » ne cohabitent pas.
 */
function cleanEmailKeywords(values: string[] | undefined) {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values ?? []) {
    const keyword = value.replace(/\s+/g, " ").trim();
    if (!keyword) continue;

    const key = keyword
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    keywords.push(keyword);
  }

  if (keywords.length > MAX_EMAIL_KEYWORDS) {
    throw new Error(`${MAX_EMAIL_KEYWORDS} mots-clés au maximum par produit concerné.`);
  }

  return keywords;
}

// Lecture volontairement ouverte : ces valeurs alimentent les listes déroulantes
// des formulaires publics (/widget, /nouveau-ticket), donc elles sont par nature
// visibles de leurs visiteurs. Toutes les écritures ci-dessous exigent en
// revanche un agent habilité.
export async function getTicketCategories() {
  return prisma.ticketCategory.findMany({ orderBy: { order: "asc" } });
}

export async function createTicketCategory(input: z.infer<typeof categorySchema>) {
  await requirePermission("settings.tickets");
  const parsed = categorySchema.parse(input);
  const data = { ...parsed, emailKeywords: cleanEmailKeywords(parsed.emailKeywords) };
  const count = await prisma.ticketCategory.count();

  if (data.isDefault) {
    await prisma.ticketCategory.updateMany({ data: { isDefault: false } });
  }

  await prisma.ticketCategory.create({ data: { ...data, order: count } });
  revalidatePath("/settings/categories");
}

export async function updateTicketCategory(id: string, input: z.infer<typeof categorySchema>) {
  await requirePermission("settings.tickets");
  const parsed = categorySchema.parse(input);
  const data = { ...parsed, emailKeywords: cleanEmailKeywords(parsed.emailKeywords) };

  if (data.isDefault) {
    await prisma.ticketCategory.updateMany({
      data: { isDefault: false },
      where: { id: { not: id } },
    });
  }

  await prisma.ticketCategory.update({ where: { id }, data });
  revalidatePath("/settings/categories");
}

// Le produit est facultatif sur un ticket : il est vidé plutôt que déplacé, ce
// qui évite de faire dire à un dossier qu'il concerne un produit qu'il ne
// concerne pas. Voir `deleteTicketStatus` pour le reste de la règle.
export async function deleteTicketCategory(id: string) {
  await requirePermission("settings.tickets");

  const impact = (await getCategoryDeletionImpacts())[id];
  if (!impact) throw new Error("Produit concerné introuvable.");
  if (impact.blockers.length > 0) throw new Error(impact.blockers.join(" "));

  if (impact.ticketCount > 0) {
    await clearCategoryOnTickets(id);
    revalidatePath("/tickets");
  }

  await prisma.ticketCategory.delete({ where: { id } });
  revalidatePath("/settings/categories");
}

export async function reorderTicketCategories(orderedIds: string[]) {
  await requirePermission("settings.tickets");
  await prisma.$transaction(
    orderedIds.map((id, order) =>
      prisma.ticketCategory.update({ where: { id }, data: { order } })
    )
  );
  revalidatePath("/settings/categories");
}
