/**
 * En-têtes de l'email à l'origine d'un ticket créé par la synchro Gmail.
 *
 * Stockés dans `Ticket.metadata` sous la clé `_email`, à côté des réponses aux
 * champs personnalisés (préfixe `_` comme `_papairis` : jamais confondu avec la
 * clé d'un CustomField, qui est dérivée d'un libellé).
 *
 * Module volontairement sans dépendance à Prisma : il est importé aussi bien
 * par le chemin d'écriture (`@/lib/email-to-ticket`) que par le rendu de la
 * fiche ticket.
 */

export const EMAIL_METADATA_KEY = "_email";

export type InboundEmailMetadata = {
  /** Adresse de l'expéditeur, en minuscules (= email du client rattaché). */
  from?: string;
  /** Nom affiché de l'expéditeur, quand l'en-tête `From` en portait un. */
  fromName?: string;
  /** En-tête `To` brut : l'adresse de la boîte support, plus d'éventuels autres destinataires. */
  to?: string;
  cc?: string;
  replyTo?: string;
  /** Objet d'origine, conservé tel quel même si le sujet du ticket est nettoyé. */
  subject?: string;
  /** En-tête `Date` brut, tel qu'écrit par le client mail de l'expéditeur. */
  date?: string;
  /** Message-ID RFC822 du mail reçu. */
  messageId?: string;
  /** Identifiant de conversation Gmail, pour retrouver le fil dans la boîte. */
  gmailThreadId?: string;
};

const FIELD_KEYS = [
  "from",
  "fromName",
  "to",
  "cc",
  "replyTo",
  "subject",
  "date",
  "messageId",
  "gmailThreadId",
] as const satisfies readonly (keyof InboundEmailMetadata)[];

/**
 * Extrait les en-têtes d'origine de `Ticket.metadata`, ou `null` si le ticket
 * n'est pas né d'un email. Tolérant par construction : la colonne est du JSON
 * libre, écrit par des versions successives du code, et la fiche ticket ne doit
 * pas casser sur une forme inattendue.
 */
export function readInboundEmailMetadata(metadata: unknown): InboundEmailMetadata | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const raw = (metadata as Record<string, unknown>)[EMAIL_METADATA_KEY];
  if (typeof raw !== "object" || raw === null) return null;

  const source = raw as Record<string, unknown>;
  const result: InboundEmailMetadata = {};
  for (const key of FIELD_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : null;
}
