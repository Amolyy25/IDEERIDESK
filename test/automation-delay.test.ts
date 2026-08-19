import { describe, expect, it } from "vitest";
import { delayToMinutes, splitDelay } from "@/lib/automation-delay";

describe("splitDelay", () => {
  it("choisit la plus grande unité qui divise le délai", () => {
    expect(splitDelay(240)).toEqual({ value: 4, unit: "hours" });
    expect(splitDelay(4320)).toEqual({ value: 3, unit: "days" });
    expect(splitDelay(30)).toEqual({ value: 30, unit: "minutes" });
  });

  // Une règle saisie en heures doit se rouvrir en heures : 90 min ne se divise
  // pas en heures entières et retombe donc en minutes.
  it("reste en minutes quand aucune unité supérieure ne tombe juste", () => {
    expect(splitDelay(90)).toEqual({ value: 90, unit: "minutes" });
  });
});

describe("delayToMinutes", () => {
  it("fait l'aller-retour avec splitDelay", () => {
    const delay = splitDelay(240);
    expect(delayToMinutes(delay.value, delay.unit)).toBe(240);
  });
});
