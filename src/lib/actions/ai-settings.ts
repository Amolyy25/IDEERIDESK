"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import {
  AI_SETTING_KEYS,
  AI_DEFAULT_MODEL,
  parseAiProvider,
  type AiProvider,
} from "@/lib/ai-settings";

export type AiSettingsStatus = {
  provider: AiProvider;
  model: string;
  hasApiKey: boolean;
};

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  const rows = await prisma.globalSetting.findMany({
    where: { key: { in: Object.values(AI_SETTING_KEYS) } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const provider = parseAiProvider(byKey[AI_SETTING_KEYS.provider]);

  return {
    provider,
    model: byKey[AI_SETTING_KEYS.model] || AI_DEFAULT_MODEL[provider],
    hasApiKey: Boolean(byKey[AI_SETTING_KEYS.apiKey]),
  };
}

const updateSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]),
  model: z.string().trim().min(1, "Modèle requis").max(100),
  // Vide = ne pas modifier la clé existante (le champ affiché côté client
  // n'est jamais la vraie valeur, donc un champ vide ne doit pas l'écraser).
  apiKey: z.string().trim().max(500).optional(),
});

export async function updateAiSettings(input: z.infer<typeof updateSchema>) {
  await requireAdmin();
  const data = updateSchema.parse(input);

  await prisma.globalSetting.upsert({
    where: { key: AI_SETTING_KEYS.provider },
    update: { value: data.provider },
    create: {
      key: AI_SETTING_KEYS.provider,
      value: data.provider,
      label: "Fournisseur IA",
    },
  });

  await prisma.globalSetting.upsert({
    where: { key: AI_SETTING_KEYS.model },
    update: { value: data.model },
    create: { key: AI_SETTING_KEYS.model, value: data.model, label: "Modèle IA" },
  });

  if (data.apiKey) {
    await prisma.globalSetting.upsert({
      where: { key: AI_SETTING_KEYS.apiKey },
      update: { value: data.apiKey },
      create: { key: AI_SETTING_KEYS.apiKey, value: data.apiKey, label: "Clé API IA" },
    });
  }

  revalidatePath("/settings/ai");
}

export async function clearAiApiKey() {
  await requireAdmin();
  await prisma.globalSetting.deleteMany({ where: { key: AI_SETTING_KEYS.apiKey } });
  revalidatePath("/settings/ai");
}
