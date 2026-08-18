import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { identifyError } from "@/lib/error-catalog";

describe("identifyError", () => {
  // Les deux pannes réellement rencontrées en production, avec leur message brut.
  it("reconnaît une base injoignable", () => {
    const error = new Error(
      "Invalid `prisma.ticket.count()` invocation: Can't reach database server at sakura.proxy.rlwy.net:12498"
    );
    expect(identifyError(error).id).toBe("database-unreachable");
  });

  it("reconnaît un client Prisma désynchronisé du schéma", () => {
    const error = new Error(
      "Invalid `prisma.message.create()` invocation: Unknown argument `replyToId`."
    );
    expect(identifyError(error).id).toBe("database-schema-mismatch");
  });

  it("lit le code Prisma porté par l'objet et non par le message", () => {
    const error = Object.assign(new Error("Timed out"), { code: "P2024" });
    expect(identifyError(error).id).toBe("database-pool-exhausted");
  });

  it("reconnaît un onglet resté sur une version périmée", () => {
    const error = new Error("Loading chunk 4823 failed.");
    error.name = "ChunkLoadError";
    expect(identifyError(error).id).toBe("stale-chunk");
  });

  it("reconnaît tous les refus du registre de permissions", () => {
    const registre = readFileSync("src/lib/permissions.ts", "utf8");
    const refus = [...registre.matchAll(/denial:\s*"([^"]+)"/g)].map((m) => m[1]);

    expect(refus.length).toBeGreaterThan(10);
    for (const message of refus) {
      expect(identifyError(new Error(message)).id, message).toBe("unauthorized");
    }
  });

  it("retombe sur le cas par défaut quand Next a masqué le message", () => {
    const error = new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds."
    );
    expect(identifyError(error).id).toBe("unknown");
  });

  it("ne propose pas de recharger quand recharger ne sert à rien", () => {
    const desync = identifyError(new Error("Unknown argument `replyToId`."));
    expect(desync.canReload).toBe(false);

    const injoignable = identifyError(new Error("Can't reach database server"));
    expect(injoignable.canReload).toBe(true);
  });

  it("n'affiche aucune chaîne de diagnostic pour une panne non technique", () => {
    expect(identifyError(new Error("Non autorisé.")).failsAt).toBeNull();
  });

  it("accepte n'importe quelle valeur levée, pas seulement une Error", () => {
    expect(identifyError("Can't reach database server").id).toBe("database-unreachable");
    expect(identifyError(undefined).id).toBe("unknown");
    expect(identifyError(null).id).toBe("unknown");
  });
});
