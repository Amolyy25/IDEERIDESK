"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { AI_SETTING_KEYS } from "@/lib/ai-settings";
import { INBOUND_CREATE_TICKETS_KEY } from "@/lib/email-account";
import { SLA_SETTING_KEYS } from "@/lib/sla";

/**
 * Réglages qui ont leur propre écran, et qui n'ont donc rien à faire dans la
 * liste générique de /settings/general — associés au nom de la section qui les
 * porte, pour orienter l'administrateur.
 *
 * Les clés de l'assistant IA sont surtout masquées pour une raison de sécurité :
 * `getGlobalSettings` est appelable en HTTP par n'importe quel client et
 * renverrait la clé d'API en clair. Le réglage de création de tickets par email
 * est un booléen stocké en « 1 » / « 0 » : l'éditer comme du texte libre ici
 * n'aurait aucun sens. Même raison pour le calendrier SLA, dont les valeurs sont
 * un mode (« calendar » / « business ») et une liste de jours en chiffres :
 * saisissables à la main, mais illisibles et faciles à casser.
 */
const OWNED_BY_SECTION: Record<string, string> = {
  ...Object.fromEntries(Object.values(AI_SETTING_KEYS).map((key) => [key, "Assistant IA"])),
  ...Object.fromEntries(Object.values(SLA_SETTING_KEYS).map((key) => [key, "SLA"])),
  [INBOUND_CREATE_TICKETS_KEY]: "Boîte de support",
};

const HIDDEN_KEYS: string[] = Object.keys(OWNED_BY_SECTION);

export async function getGlobalSettings() {
  const settings = await prisma.globalSetting.findMany({ orderBy: { label: "asc" } });
  return settings.filter((setting) => !HIDDEN_KEYS.includes(setting.key));
}

export async function updateGlobalSetting(key: string, value: string) {
  await requirePermission("settings.workspace");
  const ownerSection = OWNED_BY_SECTION[key];
  if (ownerSection) {
    throw new Error(`Ce réglage se modifie depuis la section ${ownerSection}.`);
  }

  await prisma.globalSetting.update({ where: { key }, data: { value } });
  revalidatePath("/settings");
}
