"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import { saveClosureTemplate, deleteClosureTemplate } from "@/lib/actions/closure-settings";
import type { TicketClosureTemplate } from "@/generated/prisma/client";

export function ClosureTemplateForm({
  template,
  logoUrl,
}: {
  template: TicketClosureTemplate | null;
  logoUrl: string | null;
}) {
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveClosureTemplate({ bodyHtml });
      toast.success("Modèle de clôture enregistré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("Supprimer le modèle ? Clore un ticket n'enverra plus d'email tant qu'aucun nouveau modèle n'est enregistré.")) {
      return;
    }
    setIsClearing(true);
    try {
      await deleteClosureTemplate();
      setBodyHtml("");
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
        <h2 className="text-sm font-medium">Email de clôture</h2>
        <p className="text-sm text-muted-foreground">
          Envoyé automatiquement au client quand un agent clique sur « Clore ce ticket ».
          Laissez vide pour clore les tickets sans envoyer d&apos;email.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Contenu de l&apos;email</Label>
        <RichTextEditor
          value={bodyHtml}
          onChange={setBodyHtml}
          placeholder="Bonjour, votre demande a bien été traitée…"
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
            {isClearing ? "Suppression…" : "Désactiver l'email de clôture"}
          </Button>
        )}
      </div>
    </div>
  );
}
