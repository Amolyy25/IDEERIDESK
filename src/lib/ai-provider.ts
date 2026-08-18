import type { AiConfig } from "@/lib/ai-settings";

export class AiProviderError extends Error {}

/**
 * Plafond de sortie par défaut, appliqué à la branche Anthropic (la seule des
 * trois où l'API exige un `max_tokens`).
 *
 * Il vaut pour une réponse de ticket : quelques paragraphes, jamais plus. Un
 * appel qui produit un DOCUMENT — un article de base de connaissances — le
 * relève explicitement, et lui seul : le laisser monter pour tout le monde
 * ferait payer à chaque suggestion de réponse le budget d'un article.
 */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Raw fetch calls to the two supported LLM APIs — no SDK dependency needed
 * for a single "generate one suggestion" call. Both branches return the
 * first text block/choice, which is all `/api/ai/suggest` needs.
 */
export async function generateAiSuggestion(
  config: AiConfig,
  {
    systemPrompt,
    userPrompt,
    maxTokens,
  }: {
    systemPrompt: string;
    userPrompt: string;
    /**
     * À ne relever que pour un appel dont la sortie attendue est longue. Sans
     * valeur : `DEFAULT_MAX_TOKENS`, la borne d'une réponse de ticket.
     */
    maxTokens?: number;
  }
): Promise<string> {
  if (!config.apiKey) {
    throw new AiProviderError("Aucune clé API IA configurée.");
  }

  if (config.provider === "openai") {
    // Pas de plafond transmis à OpenAI ni à Gemini : ces deux API n'en exigent
    // pas et s'arrêtent d'elles-mêmes. En poser un ici bornerait des appels
    // aujourd'hui libres — une réponse tronquée là où rien ne l'était.
    return generateWithOpenAi(config.apiKey, config.model, systemPrompt, userPrompt);
  }
  if (config.provider === "gemini") {
    return generateWithGemini(config.apiKey, config.model, systemPrompt, userPrompt);
  }
  return generateWithAnthropic(
    config.apiKey,
    config.model,
    systemPrompt,
    userPrompt,
    maxTokens ?? DEFAULT_MAX_TOKENS
  );
}

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new AiProviderError(`Anthropic a refusé la requête (${response.status})${detail}`);
  }

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new AiProviderError("Réponse Anthropic vide.");
  }
  return text;
}

async function generateWithOpenAi(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new AiProviderError(`OpenAI a refusé la requête (${response.status})${detail}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new AiProviderError("Réponse OpenAI vide.");
  }
  return text;
}

async function generateWithGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header plutôt que `?key=` en query : évite que la clé se retrouve
        // dans des logs d'URL côté proxy/serveur.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new AiProviderError(`Gemini a refusé la requête (${response.status})${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) {
    throw new AiProviderError("Réponse Gemini vide.");
  }
  return text;
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message;
    return message ? ` : ${message}` : "";
  } catch {
    return "";
  }
}
