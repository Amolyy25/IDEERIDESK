"use client";

import { Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { noteAnchor, quoteOfNote, type NoteQuote, type QuotableNote } from "@/lib/note-replies";
import { useReplyTarget } from "@/components/tickets/ticket-detail/reply-target-context";

// La note citée, au-dessus de la réponse qui la cite. Lien vers son ancre : dans
// un fil long, elle est le plus souvent hors de l'écran.
export function QuotedNote({ quote }: { quote: NoteQuote }) {
  return (
    <a
      href={`#${noteAnchor(quote.messageId)}`}
      className="mb-2 flex items-start gap-1.5 rounded-md border-l-2 border-primary/40 bg-primary/10 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/15"
    >
      <Reply className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        En réponse à <span className="font-medium text-foreground">{quote.author}</span>
        <span className="mt-0.5 line-clamp-2 block italic">« {quote.excerpt} »</span>
      </span>
    </a>
  );
}

/** Ouvre la zone de rédaction sur une réponse à cette note. */
export function ReplyToNoteButton({ message }: { message: QuotableNote }) {
  const { replyTo } = useReplyTarget();

  return (
    <Button size="sm" variant="ghost" onClick={() => replyTo(quoteOfNote(message))}>
      <Reply className="size-4" />
      Répondre
    </Button>
  );
}
