import { describe, expect, it } from "vitest";
import { CLIENT_FIELD_LIMITS, clientSchema } from "@/lib/client-fields";

const base = { name: "Jean Dupont", email: "jean.dupont@example.com" };

describe("clientSchema", () => {
  describe("email", () => {
    // Client.email est la clé de dédup du répertoire : deux casses acceptées
    // telles quelles, et la même personne se retrouve avec deux fiches.
    it("met l'adresse en minuscules", () => {
      expect(clientSchema.parse({ ...base, email: "Jean.Dupont@Example.COM" }).email).toBe(
        "jean.dupont@example.com",
      );
    });

    it("détoure l'adresse avant de la valider", () => {
      expect(clientSchema.parse({ ...base, email: "  jean.dupont@example.com  " }).email).toBe(
        "jean.dupont@example.com",
      );
    });

    it("refuse une adresse mal formée", () => {
      expect(() => clientSchema.parse({ ...base, email: "jean.dupont" })).toThrow();
    });
  });

  describe("nom", () => {
    it("détoure le nom", () => {
      expect(clientSchema.parse({ ...base, name: "  Jean Dupont  " }).name).toBe("Jean Dupont");
    });

    it("refuse un nom vide ou réduit à des espaces", () => {
      for (const name of ["", "   "]) {
        expect(() => clientSchema.parse({ ...base, name })).toThrow();
      }
    });

    it("refuse un nom plus long que la borne du formulaire", () => {
      const name = "a".repeat(CLIENT_FIELD_LIMITS.name + 1);
      expect(() => clientSchema.parse({ ...base, name })).toThrow();
    });
  });

  // Un champ vidé dans le formulaire d'édition arrive en chaîne vide. Sans la
  // conversion en `null`, Prisma écrirait "" au lieu d'effacer la valeur — et un
  // `undefined` laisserait la colonne inchangée, donc le téléphone en place.
  describe("champs facultatifs", () => {
    it("ramène à null tout ce qui ne porte aucune valeur", () => {
      for (const phone of ["", "   ", null, undefined]) {
        expect(clientSchema.parse({ ...base, phone }).phone, String(phone)).toBeNull();
      }
    });

    it("ramène une société vide à null", () => {
      expect(clientSchema.parse({ ...base, company: "" }).company).toBeNull();
    });

    it("conserve et détoure une valeur renseignée", () => {
      const parsed = clientSchema.parse({ ...base, phone: " 0102030405 ", company: " Ideeri " });
      expect(parsed.phone).toBe("0102030405");
      expect(parsed.company).toBe("Ideeri");
    });

    it("laisse les deux champs à null quand ils sont absents", () => {
      const parsed = clientSchema.parse(base);
      expect(parsed.phone).toBeNull();
      expect(parsed.company).toBeNull();
    });

    it("refuse un téléphone ou une société hors bornes", () => {
      expect(() =>
        clientSchema.parse({ ...base, phone: "0".repeat(CLIENT_FIELD_LIMITS.phone + 1) }),
      ).toThrow();
      expect(() =>
        clientSchema.parse({ ...base, company: "a".repeat(CLIENT_FIELD_LIMITS.company + 1) }),
      ).toThrow();
    });
  });
});
