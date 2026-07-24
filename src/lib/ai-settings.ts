import { prisma } from "@/lib/prisma";

/**
 * Raw AI config (provider + real API key), for server-only call sites
 * (route handlers, automations). Deliberately NOT a "use server" action —
 * a client component must never be able to import this and fetch the key.
 * Client-facing access goes through `@/lib/actions/ai-settings` instead,
 * which strips the key down to a boolean.
 */

export type AiProvider = "anthropic" | "openai" | "gemini";

export type AiConfig = {
  provider: AiProvider;
  apiKey: string | null;
  model: string;
};

const KEYS = {
  provider: "ai_provider",
  apiKey: "ai_api_key",
  model: "ai_model",
} as const;

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4.1",
  gemini: "gemini-2.5-flash",
};

const PROVIDERS: AiProvider[] = ["anthropic", "openai", "gemini"];

function parseProvider(value: string | undefined): AiProvider {
  return PROVIDERS.includes(value as AiProvider) ? (value as AiProvider) : "anthropic";
}

export async function getAiConfig(): Promise<AiConfig> {
  const rows = await prisma.globalSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const provider = parseProvider(byKey[KEYS.provider]);
  const apiKey = byKey[KEYS.apiKey] || null;
  const model = byKey[KEYS.model] || DEFAULT_MODEL[provider];

  return { provider, apiKey, model };
}

export {
  KEYS as AI_SETTING_KEYS,
  DEFAULT_MODEL as AI_DEFAULT_MODEL,
  PROVIDERS as AI_PROVIDERS,
  parseProvider as parseAiProvider,
};
