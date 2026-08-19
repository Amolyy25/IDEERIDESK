import { describe, expect, it } from "vitest";
import {
  buildCategoryImpact,
  buildPriorityImpact,
  buildStatusImpact,
} from "@/lib/ticket-attribute-impact";

const nouveau = {
  id: "nouveau",
  name: "Nouveau",
  isDefault: true,
  isClosed: false,
  isCloseDefault: false,
  isInProgressDefault: false,
  isReopenDefault: false,
};

const ferme = { ...nouveau, id: "ferme", name: "Fermé", isDefault: false, isClosed: true };

const statuses = [nouveau, ferme];

function statusImpact(status = ferme, ticketCount = 0, rules: Parameters<typeof buildStatusImpact>[0]["rules"] = []) {
  return buildStatusImpact({ status, statuses, ticketCount, rules });
}

describe("buildStatusImpact", () => {
  it("annonce le déplacement vers le statut par défaut", () => {
    const impact = statusImpact(ferme, 12);
    expect(impact.blockers).toEqual([]);
    expect(impact.summary).toBe("12 tickets passeront en « Nouveau ».");
    expect(impact.fallbackId).toBe("nouveau");
  });

  it("accorde la phrase au singulier", () => {
    expect(statusImpact(ferme, 1).summary).toBe("1 ticket passera en « Nouveau ».");
  });

  it("ne dit rien quand aucun ticket ne porte le statut", () => {
    expect(statusImpact(ferme, 0).summary).toBeNull();
  });

  // Le cas qui plantait : les deux clés étrangères sont RESTRICT, la suppression
  // partait en erreur brute côté base.
  it("bloque sur une automatisation et la nomme", () => {
    const impact = statusImpact(ferme, 3, [
      { name: "Clôture auto", triggerStatusId: "nouveau", actionStatusId: "ferme" },
    ]);
    expect(impact.blockers).toHaveLength(1);
    expect(impact.blockers[0]).toContain("« Clôture auto »");
  });

  it("compte les automatisations quand plusieurs s'appuient sur le statut", () => {
    const impact = statusImpact(ferme, 0, [
      { name: "Clôture auto", triggerStatusId: "ferme", actionStatusId: "nouveau" },
      { name: "Relance", triggerStatusId: "nouveau", actionStatusId: "ferme" },
    ]);
    expect(impact.blockers[0]).toContain("2 automatisations");
  });

  it("refuse de supprimer le statut par défaut", () => {
    expect(statusImpact(nouveau, 0).blockers[0]).toContain("statut par défaut");
  });

  it("refuse quand des tickets n'ont nulle part où aller", () => {
    const orphelin = { ...ferme, id: "orphelin" };
    const impact = buildStatusImpact({
      status: orphelin,
      statuses: [orphelin],
      ticketCount: 4,
      rules: [],
    });
    expect(impact.blockers[0]).toContain("par défaut");
    expect(impact.fallbackId).toBeNull();
  });

  it("prévient des rôles perdus et de la réouverture des tickets clos", () => {
    const impact = statusImpact({ ...ferme, isCloseDefault: true }, 2);
    expect(impact.warnings.some((line) => line.includes("clôture"))).toBe(true);
    expect(impact.warnings.some((line) => line.includes("redeviendront"))).toBe(true);
  });
});

describe("buildPriorityImpact", () => {
  const normale = { id: "normale", name: "Normale", isDefault: true };
  const urgent = { id: "urgent", name: "Urgent", isDefault: false };
  const priorities = [normale, urgent];

  it("annonce le déplacement et le recalcul des échéances", () => {
    const impact = buildPriorityImpact({
      priority: urgent,
      priorities,
      ticketCount: 5,
      rules: [],
    });
    expect(impact.summary).toBe("5 tickets passeront en « Normale ».");
    expect(impact.warnings[0]).toContain("SLA");
  });

  it("bloque qu'une règle s'en serve comme filtre ou comme action", () => {
    for (const rule of [
      { name: "Escalade", actionPriorityId: "urgent", triggerPriorityIds: [] },
      { name: "Escalade", actionPriorityId: null, triggerPriorityIds: ["urgent"] },
    ]) {
      const impact = buildPriorityImpact({ priority: urgent, priorities, ticketCount: 0, rules: [rule] });
      expect(impact.blockers[0]).toContain("« Escalade »");
    }
  });
});

describe("buildCategoryImpact", () => {
  it("vide le produit des tickets au lieu de les déplacer", () => {
    const impact = buildCategoryImpact({ categoryId: "papiris", ticketCount: 7, rules: [] });
    expect(impact.summary).toBe("7 tickets n'auront plus de produit concerné.");
    expect(impact.fallbackId).toBeNull();
    expect(impact.blockers).toEqual([]);
  });

  it("bloque sur une automatisation qui filtre ce produit", () => {
    const impact = buildCategoryImpact({
      categoryId: "papiris",
      ticketCount: 0,
      rules: [{ name: "Tri produit", triggerCategoryIds: ["papiris"] }],
    });
    expect(impact.blockers[0]).toContain("« Tri produit »");
  });
});
