"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { AI_SETTING_KEYS } from "@/lib/ai-settings";

// Réglages de l'assistant IA : ils ont leur propre écran (/settings/ai), qui
// n'expose jamais la clé d'API en clair. Ils sont donc exclus d'ici — sinon
// cette action, appelable par n'importe quel client, renvoie la clé brute.
const HIDDEN_KEYS: string[] = Object.values(AI_SETTING_KEYS);

export async function getGlobalSettings() {
  const settings = await prisma.globalSetting.findMany({ orderBy: { label: "asc" } });
  return settings.filter((setting) => !HIDDEN_KEYS.includes(setting.key));
}

export async function updateGlobalSetting(key: string, value: string) {
  await requireAdmin();
  if (HIDDEN_KEYS.includes(key)) {
    throw new Error("Ce réglage se modifie depuis la section Assistant IA.");
  }

  await prisma.globalSetting.update({ where: { key }, data: { value } });
  revalidatePath("/settings");
}
