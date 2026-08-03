"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import { EmailLayoutPreview } from "@/components/settings/email-layout/email-layout-preview";
import { resetEmailLayout, saveEmailLayout } from "@/lib/actions/email-layout";
import { EMAIL_LAYOUT_SLOTS } from "@/lib/email-layout";

export function EmailLayoutForm({
  savedHtml,
  defaultHtml,
}: {
  /** Gabarit enregistré, ou null quand celui livré avec l'application s'applique. */
  savedHtml: string | null;
  defaultHtml: string;
}) {
  const [html, setHtml] = useState(savedHtml ?? defaultHtml);
  const [isCustomized, setIsCustomized] = useState(savedHtml !== null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      // L'action renvoie le gabarit tel qu'il a été enregistré, après
      // assainissement : l'éditeur affiche alors ce qui sera réellement envoyé,
      // et non ce que l'admin croyait avoir écrit.
      const storedHtml = await saveEmailLayout({ html });
      setHtml(storedHtml);
      setIsCustomized(true);

      if (storedHtml === html.trim()) {
        toast.success("Habillage enregistré");
      } else {
        toast.success("Habillage enregistré", {
          description: "Des éléments non autorisés en email ont été retirés.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      "Revenir au gabarit par défaut ? Vos modifications seront perdues."
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      await resetEmailLayout();
      setHtml(defaultHtml);
      setIsCustomized(false);
      toast.success("Gabarit par défaut rétabli");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Réinitialisation impossible");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Ce HTML entoure <strong>tous</strong> les emails sortants : réponses aux clients, accusés
          de réception, clôtures et notifications internes. Le contenu propre à chaque email vient
          s&apos;insérer aux emplacements listés sous l&apos;éditeur.
        </p>

        <div className="flex flex-wrap gap-2">
          {isCustomized && (
            <Button variant="outline" onClick={handleReset} disabled={isResetting}>
              {isResetting ? "Réinitialisation…" : "Gabarit par défaut"}
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      {/* Éditeur et aperçu côte à côte seulement à partir de xl : en dessous,
          deux colonnes rendraient l'un et l'autre illisibles. */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="email-layout-html">HTML du gabarit</Label>
          <Textarea
            id="email-layout-html"
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            spellCheck={false}
            className="min-h-[560px] resize-y font-mono text-xs leading-relaxed"
          />
        </div>

        <div className="min-w-0 xl:sticky xl:top-6">
          <EmailLayoutPreview layoutHtml={html} />
          <p className="mt-2 text-xs text-muted-foreground">
            Exemples fictifs, mis à jour pendant la saisie. Le rendu final dépend du client mail du
            destinataire : le style inline reste le plus fiable.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4 text-xs">
        <div>
          <p className="text-sm font-medium">Emplacements</p>
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-4">
            {EMAIL_LAYOUT_SLOTS.map((slot) => (
              <div key={slot.name} className="contents">
                <dt className="font-mono text-foreground">{`{{${slot.name}}}`}</dt>
                <dd className="text-muted-foreground">{slot.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-muted-foreground">
          Un emplacement peut être rendu facultatif avec{" "}
          <span className="font-mono">{"{{#if footer}}…{{else}}…{{/if}}"}</span>. La condition doit
          tenir dans une même cellule de tableau : placée entre deux{" "}
          <span className="font-mono">&lt;tr&gt;</span>, elle est sortie du tableau à
          l&apos;enregistrement. Un nom d&apos;emplacement inconnu reste affiché tel quel dans
          l&apos;aperçu — c&apos;est le signe d&apos;une faute de frappe.
        </p>
        <p className="text-muted-foreground">
          L&apos;enveloppe du document (<span className="font-mono">&lt;!doctype&gt;</span>,{" "}
          <span className="font-mono">&lt;html&gt;</span>,{" "}
          <span className="font-mono">&lt;body&gt;</span>) est ajoutée automatiquement : écrivez
          seulement le contenu.
        </p>

        <HtmlPolicyHint profile="email" />
      </div>
    </div>
  );
}
