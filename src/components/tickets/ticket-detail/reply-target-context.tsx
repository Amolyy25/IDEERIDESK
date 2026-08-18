"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { NoteQuote } from "@/lib/note-replies";

// La note à laquelle la zone de rédaction répond. Un contexte parce que les deux
// extrémités du geste sont loin l'une de l'autre : le bouton « Répondre » est sur
// une carte du fil, le champ est un autre enfant de `TicketThread`.
//
// `subscribe` double l'état parce que désigner une note bascule aussi le champ en
// mode note et y amorce le ping de son auteur : réagir au clic, et non à l'état,
// évite d'écrire ces setState dans un effet.
type ReplyTargetValue = {
  target: NoteQuote | null;
  replyTo: (quote: NoteQuote) => void;
  clear: () => void;
  subscribe: (listener: (quote: NoteQuote) => void) => () => void;
};

const ReplyTargetContext = createContext<ReplyTargetValue | null>(null);

export function ReplyTargetProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<NoteQuote | null>(null);
  const listeners = useRef(new Set<(quote: NoteQuote) => void>());

  const replyTo = useCallback((quote: NoteQuote) => {
    setTarget(quote);
    for (const listener of listeners.current) listener(quote);
  }, []);

  const clear = useCallback(() => setTarget(null), []);

  const subscribe = useCallback((listener: (quote: NoteQuote) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({ target, replyTo, clear, subscribe }),
    [target, replyTo, clear, subscribe]
  );

  return <ReplyTargetContext.Provider value={value}>{children}</ReplyTargetContext.Provider>;
}

export function useReplyTarget() {
  const value = useContext(ReplyTargetContext);
  if (!value) {
    throw new Error("useReplyTarget doit être appelé dans un ReplyTargetProvider");
  }
  return value;
}
