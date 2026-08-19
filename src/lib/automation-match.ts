import type { AutomationRule, Prisma } from "@/generated/prisma/client";
import { breachedSlaWhere } from "@/lib/sla";

const MINUTE_MS = 60 * 1000;

export type RuleConditions = Pick<
  AutomationRule,
  | "triggerStatusId"
  | "triggerPriorityIds"
  | "triggerCategoryIds"
  | "delayMinutes"
  | "onlyUnanswered"
  | "onlyUnassigned"
  | "onlyBreachedSla"
>;

// Isolé du moteur pour être testable sans base : une erreur ici se paie en
// emails partis à des clients qui n'étaient pas concernés.
export function ticketsMatchingRule(
  rule: RuleConditions,
  now: Date = new Date()
): Prisma.TicketWhereInput {
  const cutoff = new Date(now.getTime() - rule.delayMinutes * MINUTE_MS);

  const where: Prisma.TicketWhereInput = {
    statusId: rule.triggerStatusId,
    updatedAt: { lte: cutoff },
    // Un ticket fusionné dans un autre est clos et rattaché : le rouvrir ou
    // écrire à son client irait contre la fusion qu'un agent a décidée.
    mergedIntoId: null,
  };

  // Liste vide = pas de filtre sur la dimension. Un `in: []` ne remonterait rien.
  if (rule.triggerPriorityIds.length > 0) {
    where.priorityId = { in: rule.triggerPriorityIds };
  }
  if (rule.triggerCategoryIds.length > 0) {
    where.categoryId = { in: rule.triggerCategoryIds };
  }

  // Pas `updatedAt` : une note interne ou un changement de statut est une
  // activité, pas une réponse au client.
  if (rule.onlyUnanswered) {
    where.firstRespondedAt = null;
  }
  if (rule.onlyUnassigned) {
    where.assigneeId = null;
  }
  // Sous AND : `breachedSlaWhere` pose son propre OR, qu'un étalement à plat
  // écraserait au premier autre OR ajouté ici.
  if (rule.onlyBreachedSla) {
    where.AND = [breachedSlaWhere(now)];
  }

  return where;
}
