"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { clearAiApiKey, updateAiSettings, type AiSettingsStatus } from "@/lib/actions/ai-settings";
import type { AiProvider } from "@/lib/ai-settings";
import { cn } from "@/lib/utils";

const providers: { value: AiProvider; label: string; monogram: string; description: string }[] = [
  { value: "anthropic", label: "Anthropic", monogram: "A", description: "Modèles Claude" },
  { value: "openai", label: "OpenAI", monogram: "O", description: "Modèles GPT" },
  { value: "gemini", label: "Google", monogram: "G", description: "Modèles Gemini" },
];

const modelPlaceholders: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4.1",
  gemini: "gemini-2.5-flash",
};

export function AiSettingsForm({ status }: { status: AiSettingsStatus }) {
  const router = useRouter();
  const [provider, setProvider] = useState(status.provider);
  const [model, setModel] = useState(status.model);
  const [apiKey, setApiKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await updateAiSettings({ provider, model, apiKey: apiKey || undefined });
      setApiKey("");
      toast.success("Paramètres IA enregistrés");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClearKey() {
    setIsClearing(true);
    try {
      await clearAiApiKey();
      toast.success("Clé API supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setIsClearing(false);
    }
  }

  const activeLabel = providers.find((p) => p.value === status.provider)?.label;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div className="flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            status.hasApiKey ? "bg-primary" : "bg-muted-foreground/40"
          )}
        />
        {status.hasApiKey ? (
          <span>
            <span className="font-medium">Assistant activé</span>{" "}
            <span className="text-muted-foreground">
              — {activeLabel} · {status.model}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Aucune clé enregistrée — les suggestions de réponse IA sont désactivées.
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fournisseur</Label>
        <div className="grid grid-cols-3 gap-2">
          {providers.map((p) => {
            const isSelected = provider === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setProvider(p.value)}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                  isSelected ? "border-primary bg-primary/5" : "hover:border-foreground/20"
                )}
              >
                {isSelected && (
                  <Check className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-primary" />
                )}
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground/5 text-xs font-semibold">
                  {p.monogram}
                </span>
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="model">Modèle</Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={modelPlaceholders[provider]}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apiKey">Clé API</Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status.hasApiKey ? "•••••••••••••••• (clé enregistrée)" : "sk-…"}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {status.hasApiKey
              ? "Laissez vide pour conserver la clé actuelle."
              : "Aucune clé enregistrée pour le moment."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {status.hasApiKey && (
          <Button type="button" variant="outline" onClick={handleClearKey} disabled={isClearing}>
            {isClearing ? "Suppression…" : "Supprimer la clé"}
          </Button>
        )}
      </div>
    </form>
  );
}
