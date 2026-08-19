import { describe, expect, it } from "vitest";
import { parseGeneratedRule, type RuleVocabulary } from "@/lib/ai-automation-rule";

const vocabulary: RuleVocabulary = {
  statuses: [
    { id: "s-new", name: "Nouveau" },
    { id: "s-late", name: "Retard" },
  ],
  priorities: [
    { id: "p-urgent", name: "Urgente" },
    { id: "p-low", name: "Basse" },
  ],
  categories: [{ id: "c-papiris", name: "Papiris" }],
  agents: [{ id: "a-1", name: "Marie Durand" }],
  groups: [{ id: "g-tech", name: "Support technique" }],
};

function generated(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: "Escalade urgents",
    triggerStatus: "Nouveau",
    priorities: ["Urgente"],
    categories: [],
    delayMinutes: 240,
    onlyUnanswered: true,
    onlyUnassigned: false,
    onlyBreachedSla: false,
    actionStatus: "Retard",
    actionPriority: null,
    assigneeName: null,
    addNote: true,
    noteContent: "Escaladé automatiquement.",
    sendEmail: false,
    emailHtml: null,
    notifyGroup: null,
    ...overrides,
  });
}

describe("parseGeneratedRule", () => {
  it("résout les noms en identifiants", () => {
    const draft = parseGeneratedRule(generated(), vocabulary);
    expect(draft.triggerStatusId).toBe("s-new");
    expect(draft.actionStatusId).toBe("s-late");
    expect(draft.triggerPriorityIds).toEqual(["p-urgent"]);
    expect(draft.delayMinutes).toBe(240);
    expect(draft.onlyUnanswered).toBe(true);
  });

  it("ignore la casse et les accents", () => {
    const draft = parseGeneratedRule(generated({ priorities: ["urgente"] }), vocabulary);
    expect(draft.triggerPriorityIds).toEqual(["p-urgent"]);
  });

  it("rapproche un agent sur son prénom seul", () => {
    const draft = parseGeneratedRule(generated({ assigneeName: "Marie" }), vocabulary);
    expect(draft.actionAssigneeId).toBe("a-1");
  });

  // Un statut d'arrivée égal au déclencheur rejouerait la règle sans fin : mieux
  // vaut ne rien proposer et laisser l'admin trancher.
  it("refuse un statut d'arrivée identique au déclencheur", () => {
    const draft = parseGeneratedRule(generated({ actionStatus: "Nouveau" }), vocabulary);
    expect(draft.actionStatusId).toBeNull();
  });

  it("signale ce qu'il n'a pas su résoudre au lieu de l'inventer", () => {
    const draft = parseGeneratedRule(
      generated({ priorities: ["Bloquante"], assigneeName: "Kevin" }),
      vocabulary
    );
    expect(draft.triggerPriorityIds).toEqual([]);
    expect(draft.unresolved).toContain("Bloquante");
    expect(draft.unresolved).toContain("Kevin");
  });

  it("traduit « confier à une équipe » en alerte de groupe, sans assignation", () => {
    const draft = parseGeneratedRule(generated({ notifyGroup: "Support technique" }), vocabulary);
    expect(draft.actionNotifyGroupId).toBe("g-tech");
    expect(draft.actionAssigneeId).toBeNull();
  });

  // Un ticket ne peut pas être à la fois confié à quelqu'un et diffusé à tous.
  it("ne retient que l'agent si le modèle remplit les deux volets", () => {
    const draft = parseGeneratedRule(
      generated({ assigneeName: "Marie", notifyGroup: "Support technique" }),
      vocabulary
    );
    expect(draft.actionAssigneeId).toBe("a-1");
    expect(draft.actionNotifyGroupId).toBeNull();
  });

  it("écarte un délai hors bornes", () => {
    expect(parseGeneratedRule(generated({ delayMinutes: 2 }), vocabulary).delayMinutes).toBeNull();
    expect(parseGeneratedRule(generated({ delayMinutes: "?" }), vocabulary).delayMinutes).toBeNull();
  });

  it("ne garde pas de message quand l'envoi est refusé", () => {
    const draft = parseGeneratedRule(
      generated({ sendEmail: false, emailHtml: "<p>Bonjour</p>" }),
      vocabulary
    );
    expect(draft.emailHtml).toBeNull();
  });

  it("accepte un JSON encadré de texte ou d'un bloc Markdown", () => {
    const raw = "Voici la règle :\n```json\n" + generated() + "\n```";
    expect(parseGeneratedRule(raw, vocabulary).triggerStatusId).toBe("s-new");
  });

  it("échoue clairement si la réponse ne contient pas d'objet", () => {
    expect(() => parseGeneratedRule("désolé, je ne peux pas", vocabulary)).toThrow(
      "Réponse illisible"
    );
  });
});
