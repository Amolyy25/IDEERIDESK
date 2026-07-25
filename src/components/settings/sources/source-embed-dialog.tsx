"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { sourceEmbedSnippet, sourceFormPath } from "@/lib/sources";

function CopyBlock({ label, hint, value }: { label: string; hint?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
      <pre className="max-h-52 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {value}
      </pre>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SourceEmbedDialog({
  slug,
  origin,
  trigger,
}: {
  slug: string;
  /** URL publique de l'application (APP_URL), résolue côté serveur. */
  origin: string;
  trigger: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Intégrer ce formulaire</DialogTitle>
          <DialogDescription>
            Deux options : ouvrir l&apos;adresse directement, ou embarquer le formulaire dans une
            page existante.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!origin && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              La variable d&apos;environnement APP_URL n&apos;est pas définie : les adresses
              ci-dessous sont relatives, complétez-les avec le domaine public.
            </p>
          )}
          <CopyBlock label="Adresse du formulaire" value={`${origin}${sourceFormPath(slug)}`} />
          <CopyBlock
            label="Code d'intégration"
            hint="Le formulaire remonte l'événement postMessage « papairis:ticket-created » à la page hôte après création du ticket."
            value={sourceEmbedSnippet(origin, slug)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
