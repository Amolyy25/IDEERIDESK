import { describe, expect, it } from "vitest";
import { replySummary, resolveReplyBody } from "@/lib/ticket-reply";

describe("resolveReplyBody", () => {
  it("laisse une réponse sans mise en forme en texte brut", () => {
    expect(resolveReplyBody({ content: "Bonjour" })).toEqual({ content: "Bonjour", html: null });
  });

  // `content` alimente la recherche, l'export CSV, le dossier RGPD et les boîtes
  // mail sans HTML : il doit venir du HTML ASSAINI, jamais du texte du navigateur.
  it("retranscrit le texte depuis le HTML assaini et non depuis l'entrée", () => {
    const { content, html } = resolveReplyBody({
      content: "texte envoyé par le navigateur",
      contentHtml: "<p>Bonjour <strong>Camille</strong></p>",
    });

    expect(html).toContain("<strong>");
    expect(content).toContain("Camille");
    expect(content).not.toContain("navigateur");
  });

  it("retombe sur le texte brut quand le HTML ne survit pas au filtrage", () => {
    const { content, html } = resolveReplyBody({
      content: "message de repli",
      contentHtml: "<script>alert(1)</script>",
    });

    expect(html).toBeNull();
    expect(content).toBe("message de repli");
  });

  it("retombe sur le texte brut pour un document vide", () => {
    expect(resolveReplyBody({ content: "repli", contentHtml: "<p></p>" })).toEqual({
      content: "repli",
      html: null,
    });
  });
});

describe("replySummary", () => {
  const parti = { emailSent: true, emailSkippedReason: null, alsoSentTo: 0 };

  it("dit qu'une réponse est partie", () => {
    expect(replySummary(parti)).toBe("Réponse publique envoyée au client par email.");
  });

  // Le fait à tracer en priorité : c'est lui qui explique un client sans
  // nouvelles alors que le fil du ticket montre une réponse.
  it("nomme la raison quand l'email n'est pas parti", () => {
    const summary = replySummary({
      emailSent: false,
      emailSkippedReason: "Gmail n'est pas connecté.",
      alsoSentTo: 0,
    });

    expect(summary).toContain("email non envoyé");
    expect(summary).toContain("Gmail n'est pas connecté.");
  });

  it("comble une raison manquante plutôt que d'afficher un trou", () => {
    const summary = replySummary({ emailSent: false, emailSkippedReason: null, alsoSentTo: 0 });
    expect(summary).toContain("raison inconnue");
  });

  it("accorde le pluriel des tickets fusionnés", () => {
    expect(replySummary({ ...parti, alsoSentTo: 1 })).toContain("1 ticket fusionné.");
    expect(replySummary({ ...parti, alsoSentTo: 3 })).toContain("3 tickets fusionnés.");
  });

  it("ne mentionne pas les tickets fusionnés quand il n'y en a pas", () => {
    expect(replySummary(parti)).not.toContain("fusionné");
  });
});
