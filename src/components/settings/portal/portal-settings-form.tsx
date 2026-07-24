"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { savePortalSettings } from "@/lib/actions/portal-settings";

export function PortalSettingsForm({
  settings,
}: {
  settings: { introMessage: string | null; faqEnabled: boolean };
}) {
  const [introMessage, setIntroMessage] = useState(settings.introMessage ?? "");
  const [faqEnabled, setFaqEnabled] = useState(settings.faqEnabled);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await savePortalSettings({ introMessage: introMessage || null, faqEnabled });
      toast.success("Portail mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Portail public</h2>
          <p className="text-sm text-muted-foreground">
            Page d&apos;accueil publique où un client peut créer un ticket sans se
            connecter et consulter la FAQ.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/" target="_blank">
            <ExternalLink className="h-3.5 w-3.5" />
            Voir
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="introMessage">Message d&apos;accueil</Label>
        <Textarea
          id="introMessage"
          value={introMessage}
          onChange={(e) => setIntroMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Comment pouvons-nous vous aider ?"
        />
        <p className="text-xs text-muted-foreground">
          Affiché en haut du portail, au-dessus du formulaire de contact.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border px-3.5 py-3">
        <div>
          <p className="text-sm font-medium">Afficher la FAQ</p>
          <p className="text-xs text-muted-foreground">
            Donne accès aux articles publiés de la base de connaissances depuis le portail.
          </p>
        </div>
        <Switch checked={faqEnabled} onCheckedChange={setFaqEnabled} />
      </div>

      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}
