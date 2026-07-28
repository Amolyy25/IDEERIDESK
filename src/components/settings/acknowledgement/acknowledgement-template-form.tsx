"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import {
  saveAcknowledgementTemplate,
  deleteAcknowledgementTemplate,
} from "@/lib/actions/acknowledgement-settings";
import { DEFAULT_ACKNOWLEDGEMENT_BODY_HTML } from "@/lib/email-template";
import type { TicketAcknowledgementTemplate } from "@/generated/prisma/client";

export function AcknowledgementTemplateForm({
  template,
  logoUrl,
}: {
  template: TicketAcknowledgementTemplate | null;
  logoUrl: string | null;
}) {
  // Sans modèle enregistré, l'éditeur est pré-rempli avec un texte par défaut :
  // rien n'est envoyé tant que l'admin n'a pas cliqué sur « Enregistrer ».
  const [bodyHtml, setBodyHtml] = useState(
    template?.bodyHtml ?? DEFAULT_ACKNOWLEDGEMENT_BODY_HTML
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveAcknowledgementTemplate({ bodyHtml });
      toast.success("Accusé de réception enregistré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (
      !window.confirm(
        "Supprimer le modèle ? Les nouveaux tickets ne déclencheront plus d'accusé de réception."
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await deleteAcknowledgementTemplate();
      setBodyHtml(DEFAULT_ACKNOWLEDGEMENT_BODY_HTML);
      toast.success("Modèle supprimé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Accusé de réception</h2>
        <p className="text-sm text-muted-foreground">
          Envoyé automatiquement au client dès qu&apos;un ticket est créé depuis un formulaire
          public (portail, widget, sources). Le numéro et le sujet du ticket sont ajoutés au
          message. Tant qu&apos;aucun modèle n&apos;est enregistré, aucun email n&apos;est envoyé.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Contenu de l&apos;email</Label>
        <RichTextEditor
          value={bodyHtml}
          onChange={setBodyHtml}
          placeholder="Bonjour, nous avons bien reçu votre demande…"
          minHeight="220px"
          logoUrl={logoUrl}
        />

        <HtmlPolicyHint profile="email" />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {template && (
          <Button variant="outline" onClick={handleClear} disabled={isClearing}>
            {isClearing ? "Suppression…" : "Désactiver l'accusé de réception"}
          </Button>
        )}
      </div>
    </div>
  );
}
