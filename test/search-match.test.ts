import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeForSearch } from "@/lib/search-match";
import { NAV_GROUPS, matchesNavQuery } from "@/lib/app-navigation";

describe("matchesQuery", () => {
  it("ignore accents et casse", () => {
    expect(matchesQuery(["Équipe"], "equipe")).toBe(true);
    expect(matchesQuery(["Données personnelles"], "DONNEES")).toBe(true);
  });

  it("exige tous les mots du terme, dans n'importe quel ordre", () => {
    expect(matchesQuery(["Base de connaissances"], "base conn")).toBe(true);
    expect(matchesQuery(["Base de connaissances"], "conn base")).toBe(true);
    expect(matchesQuery(["Base de connaissances"], "base facture")).toBe(false);
  });

  it("accepte un terme vide et ignore les champs absents", () => {
    expect(matchesQuery(["Tickets"], "   ")).toBe(true);
    expect(matchesQuery([null, undefined, "Tickets"], "tick")).toBe(true);
  });

  it("normalise en minuscules sans accents", () => {
    expect(normalizeForSearch("  Journal d'Audit ")).toBe("journal d'audit");
  });
});

describe("matchesNavQuery", () => {
  // Le cas qui a motivé la fonction : personne ne tape « paramètres » en entier,
  // et beaucoup tapent l'anglais.
  it("trouve une page par son chemin", () => {
    expect(matchesNavQuery({ label: "Paramètres", href: "/settings" }, "setting")).toBe(true);
  });

  it("trouve une page par un mot-clé déclaré", () => {
    const kb = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/knowledge-base")!;
    expect(matchesNavQuery(kb, "faq")).toBe(true);
    expect(matchesNavQuery(kb, "kb")).toBe(true);
  });

  it("laisse chaque entrée du plan trouvable par son propre libellé", () => {
    for (const item of NAV_GROUPS.flatMap((group) => group.items)) {
      expect(matchesNavQuery(item, item.label), item.label).toBe(true);
    }
  });

  it("ne renvoie pas une page sans rapport", () => {
    const tickets = NAV_GROUPS[0].items[0];
    expect(matchesNavQuery(tickets, "rgpd")).toBe(false);
  });
});
