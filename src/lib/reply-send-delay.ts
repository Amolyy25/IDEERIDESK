/**
 * Le délai d'annulation d'une réponse : combien de secondes elle reste
 * rattrapable après le clic sur « Envoyer ».
 *
 * Ce n'est pas une temporisation technique mais une FENÊTRE DE RATTRAPAGE. Une
 * réponse partie par email ne se reprend pas : la pièce jointe oubliée, le
 * mauvais destinataire, le « bonjour Monsieur » adressé à une cliente sont
 * autant d'erreurs qu'on voit une seconde après avoir cliqué, jamais avant. Le
 * délai transforme ces quelques secondes-là en un geste réversible.
 *
 * Réglable, parce que le bon délai dépend du rythme du support : trop court, il
 * ne laisse pas le temps de lire ce qu'on vient d'envoyer ; trop long, il fait
 * attendre l'agent devant un message qu'il sait bon. Vingt secondes par défaut —
 * le temps de relire deux paragraphes.
 *
 * `0` désactive complètement le dispositif : la réponse part au clic, comme
 * avant. C'est un réglage à part entière et non une valeur dégradée : un support
 * qui répond au fil de l'eau n'a pas envie d'une attente de plus.
 */

import { prisma } from "@/lib/prisma";

export const REPLY_SEND_DELAY_KEY = "reply_send_delay_seconds";

/** Le temps de relire ce qu'on vient d'écrire, pas celui d'aller chercher un café. */
export const DEFAULT_REPLY_SEND_DELAY_SECONDS = 20;

/**
 * Au-delà, l'attente cesse d'être une sécurité pour devenir un frein : deux
 * minutes de retard sur chaque réponse se voient dans les délais de traitement,
 * et l'agent finit par cliquer « Envoyer maintenant » à chaque fois — ce qui
 * revient à ne plus avoir de filet du tout.
 */
export const MAX_REPLY_SEND_DELAY_SECONDS = 120;

/**
 * Lit le réglage brut (`GlobalSetting.value` est du texte).
 *
 * Toute valeur illisible retombe sur le défaut plutôt que de lever : un réglage
 * mal saisi ne doit pas empêcher d'ouvrir un ticket. La saisie, elle, est
 * validée à l'enregistrement (voir `updateGlobalSetting`) — cette tolérance
 * couvre les valeurs écrites hors de l'application, pas les fautes de frappe.
 */
export function parseReplySendDelaySeconds(value: string | undefined): number {
  const seconds = Number((value ?? "").trim());
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_REPLY_SEND_DELAY_SECONDS;
  return Math.min(Math.round(seconds), MAX_REPLY_SEND_DELAY_SECONDS);
}

/** La valeur telle qu'elle doit être écrite en base, ou `null` si elle n'en est pas une. */
export function normalizeReplySendDelaySeconds(value: string): string | null {
  const seconds = Number(value.trim());
  if (!Number.isInteger(seconds)) return null;
  if (seconds < 0 || seconds > MAX_REPLY_SEND_DELAY_SECONDS) return null;
  return String(seconds);
}

/** Délai configuré dans Paramètres > Général. 0 = envoi immédiat. */
export async function readReplySendDelaySeconds(): Promise<number> {
  try {
    const row = await prisma.globalSetting.findUnique({
      where: { key: REPLY_SEND_DELAY_KEY },
      select: { value: true },
    });
    return parseReplySendDelaySeconds(row?.value);
  } catch {
    return DEFAULT_REPLY_SEND_DELAY_SECONDS;
  }
}
