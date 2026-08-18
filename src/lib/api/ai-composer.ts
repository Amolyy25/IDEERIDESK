import type { RewriteIntentId } from "@/lib/ai-rewrite";

// Appels à l'assistant de rédaction : suggestion de brouillon et réécriture.
// Les deux routes renvoient `{ error }` en cas d'échec.

export type RewritePayload = {
  /** Absent pour une sélection d'article : la route s'en sert pour choisir la permission. */
  ticketId?: string;
  text: string;
  format: "text" | "html" | "inline";
  intent: RewriteIntentId;
  instruction?: string;
};

export async function rewriteMessage(payload: RewritePayload): Promise<string> {
  const produced = await postJson<{ result?: unknown }>(
    "/api/ai/rewrite",
    payload,
    "Impossible de réécrire le message."
  );

  const result = typeof produced.result === "string" ? produced.result : "";
  if (!result.trim()) throw new Error("L'IA n'a rien renvoyé.");
  return result;
}

/** Renvoie du texte brut, pas du HTML d'éditeur : à convertir avant insertion. */
export async function suggestReply(ticketId: string): Promise<string> {
  const produced = await postJson<{ suggestion?: unknown }>(
    "/api/ai/suggest",
    { ticketId },
    "Impossible de générer une suggestion."
  );

  return typeof produced.suggestion === "string" ? produced.suggestion : "";
}

async function postJson<T>(url: string, body: unknown, fallbackError: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  // Une 502 du fournisseur peut renvoyer du HTML : le parsing échoue avant qu'on
  // ait pu lire `error`.
  const parsed = await response.json().catch(() => null);
  if (!response.ok) throw new Error(parsed?.error ?? fallbackError);
  return parsed as T;
}
