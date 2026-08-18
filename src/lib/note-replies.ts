import { excerpt } from "@/lib/utils";

// Réponses à une note interne : la citation affichée au-dessus d'une réponse dans
// le fil, et l'extrait rappelé dans la zone de rédaction pendant qu'on l'écrit.

/** Une ligne de citation, pas la note entière. */
const EXCERPT_LENGTH = 120;

/** Note citée, réduite à ce qu'un affichage a besoin d'en savoir. */
export type NoteQuote = {
  messageId: string;
  /** Auteur de la note citée. Nul si son compte a été supprimé depuis. */
  authorId: string | null;
  author: string;
  excerpt: string;
};

/** Note interne telle qu'une citation la lit : son auteur et son texte. */
export type QuotableNote = {
  id: string;
  content: string;
  agentId: string | null;
  agent: { name: string } | null;
};

/** Ancre d'une note dans le fil : cible des citations et des liens de la cloche. */
export function noteAnchor(messageId: string) {
  return `note-${messageId}`;
}

export function quoteOfNote(message: QuotableNote): NoteQuote {
  return {
    messageId: message.id,
    authorId: message.agentId,
    author: message.agent?.name ?? "Agent",
    excerpt: excerpt(message.content, EXCERPT_LENGTH),
  };
}

// Résolu en mémoire : la note citée appartient au même ticket (voir
// `addTicketMessage`), elle est donc déjà chargée. Une note supprimée depuis n'a
// pas d'entrée, sa réponse s'affiche comme une note ordinaire.
export function resolveNoteQuotes(
  messages: (QuotableNote & { replyToId: string | null })[]
): Map<string, NoteQuote> {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const quotes = new Map<string, NoteQuote>();

  for (const message of messages) {
    if (!message.replyToId) continue;
    const target = byId.get(message.replyToId);
    if (target) quotes.set(message.id, quoteOfNote(target));
  }

  return quotes;
}
