/**
 * Le garde-fou qui ne se prend pas au sérieux.
 *
 * Une insulte partie chez le mandant d'une agence ne se reprend pas : c'est le
 * genre d'envoi qui se règle ensuite au téléphone, avec le patron de l'agence.
 * Le premier clic sur « Envoyer » ne part donc jamais — il déclenche un GAME
 * OVER, et rend la main.
 *
 * Ce n'est délibérément PAS une interdiction. Un agent a de vraies raisons
 * d'écrire ces mots : citer un client qui s'est emporté, dans une note interne,
 * en fait partie. Le second clic passe donc (voir `ReplyComposer`) — ce qu'on
 * veut supprimer, c'est l'envoi parti sans y penser, pas le mot lui-même.
 */

/** Les trois mots surveillés. Le pluriel est couvert par le motif ci-dessous. */
const INSULTS = ["pute", "conne", "salope"];

/**
 * Les frontières de mot ne sont pas une précaution de style : sans elles,
 * « réputé », « dispute », « déconne » ou « connexion » déclencheraient un GAME
 * OVER en pleine réponse sérieuse — et l'easter egg deviendrait un bug.
 */
const INSULT_PATTERN = new RegExp(`\\b(?:${INSULTS.join("|")})s?\\b`, "i");

/**
 * Le premier mot surveillé trouvé dans le texte, tel qu'il a été écrit, ou
 * `null`.
 *
 * Les accents sont retirés avant la recherche pour que la casse et les
 * diacritiques ne servent pas de contournement involontaire — les mots visés
 * n'en portent pas, mais un « salopé » tapé de travers doit compter.
 */
export function findInsult(text: string): string | null {
  const match = INSULT_PATTERN.exec(stripAccents(text));
  return match ? match[0].toLowerCase() : null;
}

function stripAccents(text: string) {
  // NFD sépare la lettre de son accent, la plage retirée ensuite est celle des
  // signes diacritiques combinants.
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
