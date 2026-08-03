"use client";

import { useDeferredValue } from "react";
import { EMAIL_FONT_STACK } from "@/lib/email-layout";
import { renderSignatureBlockHtml } from "@/lib/email-template";
import {
  SIGNATURE_PREVIEW_AGENT,
  fillSignatureVariables,
  signatureVariablesForAgent,
} from "@/lib/signature";

/**
 * Aperçu de la signature en cours d'édition, variables remplies avec un agent
 * d'exemple : c'est le seul moyen de vérifier qu'un `{{prenom}}` est bien écrit
 * sans envoyer un email de test à un client.
 *
 * Rendu dans une `iframe` en bac à sable, comme l'aperçu du gabarit d'email : le
 * HTML affiché n'est pas encore assaini (l'assainissement a lieu à
 * l'enregistrement), donc rien de ce qui s'y trouve ne doit pouvoir s'exécuter
 * dans l'application. `sandbox=""` retire toutes les permissions, script
 * compris, et isole aussi les styles de la page de réglages.
 */
export function SignaturePreview({ bodyHtml }: { bodyHtml: string }) {
  // Le rendu suit la frappe avec un tour de retard : reconstruire le document à
  // chaque touche saccade l'éditeur.
  const deferredHtml = useDeferredValue(bodyHtml);

  const filledHtml = fillSignatureVariables(
    deferredHtml,
    signatureVariablesForAgent(SIGNATURE_PREVIEW_AGENT)
  );

  const document = `<!doctype html>
<html>
  <body style="margin:0;padding:4px 12px;background:#ffffff;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.6;color:#18181b;">
    ${renderSignatureBlockHtml(filledHtml)}
  </body>
</html>`;

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        Aperçu — exemple avec {SIGNATURE_PREVIEW_AGENT.name}
      </p>
      <iframe
        title="Aperçu de la signature"
        sandbox=""
        srcDoc={document}
        className="block h-32 w-full bg-white"
      />
    </div>
  );
}
