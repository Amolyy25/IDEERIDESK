import { describe, expect, it } from "vitest";
import { ticketsMatchingRule, type RuleConditions } from "@/lib/automation-match";

const NOW = new Date("2026-08-19T12:00:00Z");

const rule: RuleConditions = {
  triggerStatusId: "status-new",
  triggerPriorityIds: [],
  triggerCategoryIds: [],
  delayMinutes: 240,
  onlyUnanswered: false,
  onlyUnassigned: false,
  onlyBreachedSla: false,
};

describe("ticketsMatchingRule", () => {
  it("remonte le délai depuis maintenant", () => {
    const where = ticketsMatchingRule(rule, NOW);
    expect(where.updatedAt).toEqual({ lte: new Date("2026-08-19T08:00:00Z") });
  });

  // Un ticket fusionné est clos et rattaché à un autre : le rouvrir ou écrire à
  // son client irait contre la fusion décidée par un agent.
  it("écarte toujours les tickets fusionnés", () => {
    expect(ticketsMatchingRule(rule, NOW).mergedIntoId).toBeNull();
  });

  it("ne pose pas de filtre quand la liste est vide", () => {
    const where = ticketsMatchingRule(rule, NOW);
    expect(where).not.toHaveProperty("priorityId");
    expect(where).not.toHaveProperty("categoryId");
  });

  it("filtre sur les priorités et produits listés", () => {
    const where = ticketsMatchingRule(
      { ...rule, triggerPriorityIds: ["p1", "p2"], triggerCategoryIds: ["c1"] },
      NOW
    );
    expect(where.priorityId).toEqual({ in: ["p1", "p2"] });
    expect(where.categoryId).toEqual({ in: ["c1"] });
  });

  it("traduit « personne n'a répondu » en absence de première réponse", () => {
    expect(ticketsMatchingRule({ ...rule, onlyUnanswered: true }, NOW).firstRespondedAt).toBeNull();
  });

  // `breachedSlaWhere` pose son propre OR : à plat, il serait écrasé par tout
  // autre OR ajouté à la clause.
  it("imbrique la condition SLA sous AND pour préserver son OR", () => {
    const where = ticketsMatchingRule({ ...rule, onlyBreachedSla: true }, NOW);
    expect(Array.isArray(where.AND)).toBe(true);
    expect((where.AND as Record<string, unknown>[])[0]).toHaveProperty("OR");
  });
});
