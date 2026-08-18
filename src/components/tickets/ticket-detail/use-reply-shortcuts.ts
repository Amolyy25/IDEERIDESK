"use client";

import { useEffect, useRef, useState } from "react";
import type { RewriteIntentId } from "@/lib/ai-rewrite";

// Maintien de Tab au-delà duquel la liste des reprises s'ouvre au lieu d'en
// appliquer une. Le seuil bas est ce qui compte : sous 300 ms, un appui un peu
// appuyé ouvrirait la liste alors qu'on voulait juste corriger son message.
const HOLD_TO_CHOOSE_MS = 600;

type UseReplyShortcutsOptions = {
  aiEnabled: boolean;
  isPrivate: boolean;
  /** Pendant l'attente d'envoi ou une réécriture : le champ ne répond plus. */
  isLocked: boolean;
  hasText: boolean;
  rewriteIntent: RewriteIntentId;
  onSubmit: () => void;
  onSuggest: () => void;
  onRewrite: (intent: RewriteIntentId) => void;
  focusComposer: (privateMode: boolean) => void;
};

// Tab reprend le message, ⌘/Ctrl + Entrée envoie, ⌘/Ctrl + O fait proposer un
// brouillon, Échap rend la main. La fenêtre d'annulation a ses propres touches
// (voir `useReplySend`).
export function useReplyShortcuts({
  aiEnabled,
  isPrivate,
  isLocked,
  hasText,
  rewriteIntent,
  onSubmit,
  onSuggest,
  onRewrite,
  focusComposer,
}: UseReplyShortcutsOptions) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  // L'appui en cours sur Tab : le minuteur qui décide entre agir et proposer, et
  // le souvenir de ce qu'il a décidé — le relâchement ne doit pas déclencher une
  // réécriture par-dessus la liste qui vient de s'ouvrir.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdOpenedMenu = useRef(false);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // Écouté à la remontée, sur le formulaire entier : l'éditeur riche et le champ de
  // note traitent déjà certaines touches et se signalent en arrêtant l'événement,
  // d'où le premier test — sans lui, un même appui enverrait deux messages.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;

    // Trois garde-fous, aucun facultatif. La touche n'est détournée que DANS la
    // zone de saisie : ailleurs dans le formulaire, Tab reste la façon d'atteindre
    // le bouton suivant. Elle ne l'est pas non plus sur un champ vide, ce qui
    // permet de traverser la zone de rédaction au clavier sans y rester pris. Et
    // `defaultPrevented` laisse la main à l'éditeur (indenter une liste) comme à
    // l'autocomplétion des mentions (valider un nom).
    //
    // Maj + Tab n'est jamais touché, et Échap rend la main : personne ne se
    // retrouve enfermé dans le champ.
    if (event.key === "Tab" && !event.shiftKey && !isLocked && aiEnabled) {
      if (!isWritingSurface(event.target)) return;
      if (!hasText) return;
      event.preventDefault();
      // La répétition automatique du clavier renvoie l'événement toutes les
      // quelques dizaines de millisecondes : un seul minuteur, armé au premier.
      if (event.repeat || holdTimer.current) return;

      holdOpenedMenu.current = false;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdOpenedMenu.current = true;
        setAiMenuOpen(true);
      }, HOLD_TO_CHOOSE_MS);
      return;
    }

    // La sortie de secours du champ, pour qui navigue au clavier.
    if (event.key === "Escape" && !isLocked && isWritingSurface(event.target)) {
      (event.target as HTMLElement).blur();
      return;
    }

    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "enter") {
      event.preventDefault();
      onSubmit();
      return;
    }
    // Comme le bouton : une suggestion s'écrit pour un client, elle n'a rien à
    // proposer sur une note interne.
    if (key === "o" && !isPrivate) {
      event.preventDefault();
      onSuggest();
    }
  }

  // C'est le relâchement qui applique la reprise : à l'appui, on ne sait pas encore
  // lequel des deux gestes est en cours.
  function handleKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const pending = holdTimer.current;
    holdTimer.current = null;
    if (pending) clearTimeout(pending);

    // La liste a pris la main pendant l'appui : c'est à l'agent de choisir.
    if (holdOpenedMenu.current || !pending) return;

    onRewrite(rewriteIntent);
  }

  // Refermée après un maintien de Tab : le curseur retourne dans le texte, sans
  // quoi il reviendrait sur le chevron, à deux tabulations du champ.
  function onAiMenuOpenChange(next: boolean) {
    setAiMenuOpen(next);
    if (!next && holdOpenedMenu.current) {
      holdOpenedMenu.current = false;
      focusComposer(isPrivate);
    }
  }

  return { aiMenuOpen, onAiMenuOpenChange, handleKeyDown, handleKeyUp };
}

// Le champ de note, ou le document de l'éditeur riche : ailleurs dans le formulaire,
// Tab garde son rôle de navigation.
function isWritingSurface(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "TEXTAREA" || target.isContentEditable;
}
