"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RULE_DESCRIPTION_CHARS } from "@/lib/ai-automation-rule";

const EXAMPLE =
  "Un ticket urgent et nouveau sans réponse depuis 4 h passe en retard et part chez Marie.";

/**
 * Dicter la règle plutôt que la composer. Ce que l'IA renvoie remplit le
 * formulaire — rien n'est enregistré avant relecture.
 */
export function RuleAiBar({
  onGenerate,
  isGenerating,
}: {
  onGenerate: (description: string) => void;
  isGenerating: boolean;
}) {
  const [description, setDescription] = useState("");
  const canSubmit = description.trim().length >= 10 && !isGenerating;

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-foreground" aria-hidden />
        <p className="text-sm font-medium">Décrire la règle</p>
      </div>

      <Textarea
        rows={2}
        value={description}
        maxLength={MAX_RULE_DESCRIPTION_CHARS}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={EXAMPLE}
        // Cmd/Ctrl+Entrée : la même combinaison que pour envoyer une réponse
        // ailleurs dans l'application.
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) {
            event.preventDefault();
            onGenerate(description.trim());
          }
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Les champs ci-dessous sont pré-remplis, à vous de les corriger.
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canSubmit}
          onClick={() => onGenerate(description.trim())}
        >
          {isGenerating ? "Génération…" : "Remplir le formulaire"}
        </Button>
      </div>
    </div>
  );
}
