import { describe, expect, it } from "vitest";
import { buildTicketListWhere } from "@/lib/ticket-query";
import { SLA_BREACHED_FILTER, UNASSIGNED_FILTER } from "@/lib/ticket-filters";

/** Les conditions du `OR` de recherche, aplaties pour pouvoir être inspectées. */
function orClauses(where: ReturnType<typeof buildTicketListWhere>) {
  return (where.OR ?? []) as Record<string, unknown>[];
}

/** Condition posée par la file pour ne montrer que ce qui reste à traiter. */
const OUVERTS_SEULEMENT = { status: { isClosed: false } };

describe("buildTicketListWhere", () => {
  it("ne pose aucun filtre choisi sans filtre demandé", () => {
    const where = buildTicketListWhere({});
    expect(where.statusId).toBeUndefined();
    expect(where.assigneeId).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  // `null` et `undefined` ne disent pas la même chose à Prisma : `undefined`
  // supprime la condition, donc renverrait TOUS les tickets.
  it("traduit « non assigné » en null et non en undefined", () => {
    expect(buildTicketListWhere({ assigneeId: UNASSIGNED_FILTER }).assigneeId).toBeNull();
  });

  it("ignore un identifiant d'agent vide", () => {
    expect(buildTicketListWhere({ assigneeId: "" }).assigneeId).toBeUndefined();
    expect(buildTicketListWhere({ assigneeId: "agent-1" }).assigneeId).toBe("agent-1");
  });

  describe("recherche", () => {
    it("trouve un ticket par son numéro, avec ou sans dièse", () => {
      for (const terme of ["128", "#128"]) {
        expect(orClauses(buildTicketListWhere({ search: terme }))).toContainEqual({ number: 128 });
      }
    });

    it("ne fabrique pas de condition sur le numéro pour un terme textuel", () => {
      const clauses = orClauses(buildTicketListWhere({ search: "panne" }));
      expect(clauses.some((c) => "number" in c)).toBe(false);
    });

    it("écarte un numéro négatif ou décimal", () => {
      for (const terme of ["-4", "3.5", "0"]) {
        const clauses = orClauses(buildTicketListWhere({ search: terme }));
        expect(clauses.some((c) => "number" in c), terme).toBe(false);
      }
    });

    it("cherche aussi dans le corps du fil et chez le client", () => {
      const clauses = orClauses(buildTicketListWhere({ search: "dossier" }));
      expect(clauses.some((c) => "messages" in c)).toBe(true);
      expect(clauses.some((c) => "client" in c)).toBe(true);
    });

    it("ignore une recherche réduite à des espaces", () => {
      expect(buildTicketListWhere({ search: "   " }).OR).toBeUndefined();
    });
  });

  describe("périmètre produits", () => {
    it("applique les produits des groupes de l'agent", () => {
      const where = buildTicketListWhere({ categoryIds: ["a", "b"] });
      expect(where.categoryId).toEqual({ in: ["a", "b"] });
    });

    it("laisse un filtre manuel primer sur le périmètre automatique", () => {
      const where = buildTicketListWhere({ categoryId: "choisi", categoryIds: ["a", "b"] });
      expect(where.categoryId).toBe("choisi");
    });
  });

  describe("SLA dépassé", () => {
    it("place la condition dans AND et exclut les tickets clos", () => {
      const where = buildTicketListWhere({ sla: SLA_BREACHED_FILTER });
      expect(Array.isArray(where.AND)).toBe(true);
      expect(where.AND).toHaveLength(2);
      expect(where.AND).toContainEqual({ status: { isClosed: false } });
    });

    // Le piège que le découpage devait préserver : `breachedSlaWhere` porte son
    // propre `OR` et la recherche en pose un autre. Deux `OR` au même niveau se
    // remplaceraient, et la vue montrerait des tickets à l'heure.
    it("cohabite avec une recherche sans que les deux OR se remplacent", () => {
      const where = buildTicketListWhere({ sla: SLA_BREACHED_FILTER, search: "128" });

      expect(where.AND).toHaveLength(2);
      expect(orClauses(where)).toContainEqual({ number: 128 });

      const [conditionSla] = where.AND as Record<string, unknown>[];
      expect(conditionSla).toHaveProperty("OR");
    });

    it("ne pose pas la condition de retard quand le filtre SLA est absent", () => {
      const where = buildTicketListWhere({ sla: "" });
      expect(where.AND).toEqual([OUVERTS_SEULEMENT]);
    });
  });

  describe("tickets clos", () => {
    it("les écarte de la file par défaut", () => {
      expect(buildTicketListWhere({}).AND).toEqual([OUVERTS_SEULEMENT]);
    });

    // Le seul geste qui vise un ticket clos : la file ne les liste plus, une
    // recherche qui ne les trouverait pas les rendrait inatteignables.
    it("les laisse remonter dans une recherche", () => {
      expect(buildTicketListWhere({ search: "128" }).AND).toBeUndefined();
    });

    it("les laisse remonter sur un statut demandé explicitement", () => {
      expect(buildTicketListWhere({ statusId: "statut-clos" }).AND).toBeUndefined();
    });

    it("les garde masqués dans la vue SLA, recherche comprise", () => {
      const where = buildTicketListWhere({ sla: SLA_BREACHED_FILTER, search: "128" });
      expect(where.AND).toContainEqual(OUVERTS_SEULEMENT);
    });
  });
});
