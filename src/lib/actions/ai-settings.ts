"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import {
  AI_SETTING_KEYS,
  AI_DEFAULT_MODEL,
  parseAiProvider,
  type AiProvider,
} from "@/lib/ai-settings";
import { DUPLICATE_DETECTION_KEY } from "@/lib/ticket-duplicates";

export type AiSettingsStatus = {
  provider: AiProvider;
  model: string;
  hasApiKey: boolean;
  duplicateDetection: boolean;
};

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  await requirePermission("settings.workspace");
  const rows = await prisma.globalSetting.findMany({
    where: { key: { in: [...Object.values(AI_SETTING_KEYS), DUPLICATE_DETECTION_KEY] } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const provider = parseAiProvider(byKey[AI_SETTING_KEYS.provider]);

  return {
    provider,
    model: byKey[AI_SETTING_KEYS.model] || AI_DEFAULT_MODEL[provider],
    hasApiKey: Boolean(byKey[AI_SETTING_KEYS.apiKey]),
    // Absent = activé : la détection rend service dès qu'une clé existe, sans
    // réglage à découvrir. Voir `scanTicketForDuplicates`.
    duplicateDetection: byKey[DUPLICATE_DETECTION_KEY] !== "false",
  };
}

const updateSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]),
  model: z.string().trim().min(1, "Modèle requis").max(100),
  // Vide = ne pas modifier la clé existante (le champ affiché côté client
  // n'est jamais la vraie valeur, donc un champ vide ne doit pas l'écraser).
  apiKey: z.string().trim().max(500).optional(),
  duplicateDetection: z.boolean(),
});

export async function updateAiSettings(input: z.infer<typeof updateSchema>) {
  await requirePermission("settings.workspace");
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

  await prisma.globalSetting.upsert({
    where: { key: DUPLICATE_DETECTION_KEY },
    update: { value: String(data.duplicateDetection) },
    create: {
      key: DUPLICATE_DETECTION_KEY,
      value: String(data.duplicateDetection),
      label: "Détection IA des doublons",
      description:
        "Propose de fusionner deux tickets portant sur la même demande, à l'ouverture d'une fiche.",
    },
  });

  revalidatePath("/settings/ai");
  revalidatePath("/tickets");
}

export async function clearAiApiKey() {
  await requirePermission("settings.workspace");
  await prisma.globalSetting.deleteMany({ where: { key: AI_SETTING_KEYS.apiKey } });
  revalidatePath("/settings/ai");
}
