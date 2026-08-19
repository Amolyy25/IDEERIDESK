import { describe, expect, it } from "vitest";
import { antivirusAlertMessage, detectAntivirusFailure } from "@/lib/antivirus-alert";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-08-19T23:05:00Z");

function heartbeat(overrides: Partial<Parameters<typeof detectAntivirusFailure>[0]> = {}) {
  return {
    job: "antivirus",
    lastRunAt: new Date(now.getTime() - HOUR),
    lastSuccessAt: new Date(now.getTime() - HOUR),
    lastDetail: null,
    alertedAt: null,
    ...overrides,
  };
}

describe("detectAntivirusFailure", () => {
  it("ne signale rien quand le dernier passage a réussi", () => {
    expect(detectAntivirusFailure(heartbeat(), now)).toBeNull();
  });

  it("ne signale rien sans battement enregistré", () => {
    expect(detectAntivirusFailure(null, now)).toBeNull();
  });

  it("signale un passage qui a eu lieu mais s'est mal terminé", () => {
    const failure = detectAntivirusFailure(
      heartbeat({
        lastRunAt: new Date(now.getTime() - HOUR),
        lastSuccessAt: new Date(now.getTime() - 25 * HOUR),
        lastDetail: "clamd injoignable",
      }),
      now
    );

    expect(failure).toMatchObject({ kind: "failed", detail: "clamd injoignable" });
  });

  it("signale une tâche qui n'a jamais réussi", () => {
    const failure = detectAntivirusFailure(heartbeat({ lastSuccessAt: null }), now);
    expect(failure?.kind).toBe("failed");
  });

  // Le passage est quotidien : une nuit décalée par un redéploiement ne doit pas
  // alerter, une nuit entièrement perdue doit le faire dans la foulée.
  it("tolère un retard de moins de 26 h", () => {
    const late = new Date(now.getTime() - 25 * HOUR);
    expect(detectAntivirusFailure(heartbeat({ lastRunAt: late, lastSuccessAt: late }), now)).toBeNull();
  });

  it("signale un silence de plus de 26 h", () => {
    const old = new Date(now.getTime() - 27 * HOUR);
    const failure = detectAntivirusFailure(heartbeat({ lastRunAt: old, lastSuccessAt: old }), now);

    expect(failure).toMatchObject({ kind: "stalled", lastSuccessAt: old });
  });
});

describe("antivirusAlertMessage", () => {
  const stalled = { kind: "stalled" as const, lastSuccessAt: new Date(now.getTime() - 48 * HOUR), detail: null };

  it("compte les fichiers restés en attente", () => {
    expect(antivirusAlertMessage(stalled, 14)).toContain("14 fichiers en attente d'analyse.");
    expect(antivirusAlertMessage(stalled, 1)).toContain("1 fichier en attente d'analyse.");
  });

  it("reste explicite quand la file est vide", () => {
    expect(antivirusAlertMessage(stalled, 0)).toContain("ne sont plus vérifiés");
  });

  it("reprend la cause remontée par le scanner", () => {
    const failed = { kind: "failed" as const, lastSuccessAt: null, detail: "connexion refusée" };
    expect(antivirusAlertMessage(failed, 3)).toContain("en échec — connexion refusée.");
  });
});
