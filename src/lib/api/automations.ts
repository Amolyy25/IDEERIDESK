import type { GeneratedRuleDraft } from "@/lib/ai-automation-rule";

// Appels réseau de la page des règles automatiques.

export async function generateRuleFromDescription(
  description: string
): Promise<GeneratedRuleDraft> {
  const response = await fetch("/api/ai/automation-rule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description }),
  });

  // Une 502 du fournisseur peut renvoyer du HTML : le parsing échoue avant
  // qu'on ait pu lire `error`.
  const parsed = await response.json().catch(() => null);
  if (!response.ok) throw new Error(parsed?.error ?? "Impossible de générer la règle.");
  if (!parsed?.draft) throw new Error("L'IA n'a rien renvoyé.");
  return parsed.draft as GeneratedRuleDraft;
}
