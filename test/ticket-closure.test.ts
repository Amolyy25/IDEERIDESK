import { describe, expect, it } from "vitest";
import { closureSummary } from "@/lib/ticket-closure";

const clos = {
  statusName: "Résolu",
  silent: false,
  emailSent: false,
  emailSkippedReason: null,
  alsoSentTo: 0,
};

describe("closureSummary", () => {
  it("annonce toujours le statut d'arrivée", () => {
    expect(closureSummary(clos)).toBe("Statut passé à « Résolu ».");
  });

  it("signale l'email de clôture parti au client", () => {
    expect(closureSummary({ ...clos, emailSent: true })).toContain(
      "Email de clôture envoyé au client."
    );
  });

  it("nomme la raison quand l'email n'est pas parti", () => {
    const summary = closureSummary({ ...clos, emailSkippedReason: "Gmail n'est pas connecté." });
    expect(summary).toContain("Email de clôture non envoyé : Gmail n'est pas connecté.");
  });

  // Le fait le plus important d'une clôture silencieuse : que PERSONNE n'a été
  // prévenu, et que c'était voulu. C'est ce qui répond, des mois plus tard, au
  // client qui affirme n'avoir jamais eu de nouvelles.
  it("trace explicitement qu'une clôture silencieuse n'a prévenu personne", () => {
    const summary = closureSummary({ ...clos, silent: true });
    expect(summary).toContain("Clôture silencieuse demandée par l'agent");
    expect(summary).toContain("aucun email envoyé");
  });

  it("accorde le pluriel de la répercussion sur les doublons", () => {
    expect(closureSummary({ ...clos, alsoSentTo: 1 })).toContain("sur 1 ticket fusionné.");
    expect(closureSummary({ ...clos, alsoSentTo: 2 })).toContain("sur 2 tickets fusionnés.");
  });

  it("assemble les faits dans l'ordre, sans trou entre eux", () => {
    const summary = closureSummary({
      ...clos,
      emailSent: true,
      alsoSentTo: 2,
    });

    expect(summary).toBe(
      "Statut passé à « Résolu ». Email de clôture envoyé au client. " +
        "Clôture répercutée sur 2 tickets fusionnés."
    );
  });
});
