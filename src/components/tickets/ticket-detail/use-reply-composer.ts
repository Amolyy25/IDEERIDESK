"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_OVER_MS } from "@/components/tickets/ticket-detail/game-over-curtain";
import { useTicketPresence } from "@/components/tickets/ticket-detail/use-ticket-presence";
import {
  useReplyDraftWriter,
  type ReplyDraft,
} from "@/components/tickets/ticket-detail/use-reply-draft";
import { useReplyAi } from "@/components/tickets/ticket-detail/use-reply-ai";
import { useReplyAttachments } from "@/components/tickets/ticket-detail/use-reply-attachments";
import {
  useReplySend,
  type PreparedReply,
} from "@/components/tickets/ticket-detail/use-reply-send";
import { useReplyShortcuts } from "@/components/tickets/ticket-detail/use-reply-shortcuts";
import { useReplyTarget } from "@/components/tickets/ticket-detail/reply-target-context";
import { appendReplyHtml, isReplyHtmlEmpty, textToReplyHtml } from "@/lib/reply-html";
import { htmlToText } from "@/lib/html-to-text";
import { findInsult } from "@/lib/insult-easter-egg";
import { playGameOverJingle } from "@/lib/game-over-sound";
import type { TicketCannedResponses } from "@/lib/canned-responses";

type UseReplyComposerOptions = {
  ticketId: string;
  /** Le brouillon local est rangé sous le nom de l'agent connecté. */
  currentAgentId: string;
  aiEnabled: boolean;
  sendDelaySeconds: number;
  /** La réponse type qui pré-remplit le champ, s'il en existe une. */
  autoInserted: TicketCannedResponses["autoInserted"];
  /** Brouillon retrouvé à l'ouverture. Ne change jamais en cours de vie. */
  restoredDraft: ReplyDraft | null;
};

// L'état de la zone de rédaction : le texte, le brouillon, et le câblage des trois
// hooks qui s'en servent (envoi, assistant, clavier).
export function useReplyComposer({
  ticketId,
  currentAgentId,
  aiEnabled,
  sendDelaySeconds,
  autoInserted,
  restoredDraft,
}: UseReplyComposerOptions) {
  // La réponse type arrive en texte : convertie une fois pour toutes, pour que la
  // comparaison « le champ contient-il encore le pré-remplissage ? » porte sur
  // deux valeurs de même nature.
  const [autoInsertedHtml] = useState(() => textToReplyHtml(autoInserted?.body ?? ""));

  // Un brouillon retrouvé l'emporte sur la réponse type : il est de la main de
  // l'agent, elle est une proposition de l'application. Les deux ne sont qu'un
  // état INITIAL — dès ce premier rendu le texte appartient à l'agent.
  const [html, setHtml] = useState(restoredDraft?.html ?? autoInsertedHtml);
  // La note interne reste du texte : son autocomplétion en @ travaille sur une
  // chaîne et une position de curseur, et rien de ce qui s'y écrit ne part par
  // email.
  const [note, setNote] = useState(restoredDraft?.note ?? "");
  // Le mode fait partie du brouillon : retrouver le texte d'une note dans le champ
  // « Répondre au client » est la confusion qui envoie à un client ce qui était
  // destiné à l'équipe.
  const [isPrivate, setIsPrivate] = useState(restoredDraft?.isPrivate ?? false);

  // Le mot qui vient d'interrompre un envoi, le temps du GAME OVER.
  const [gameOverWord, setGameOverWord] = useState<string | null>(null);
  // Les mots pour lesquels la blague a déjà été faite. Une référence et non un
  // état : rien à l'écran n'en dépend.
  const excusedInsults = useRef(new Set<string>());

  // La note à laquelle on répond, désignée depuis le fil (voir `ReplyToNoteButton`).
  const {
    target: replyTarget,
    clear: clearReplyTarget,
    subscribe: onReplyToNote,
  } = useReplyTarget();

  // Poignées pour rendre le curseur au champ : c'est lui, et non le bouton qui
  // vient d'être cliqué, qui doit reprendre la main.
  const editorFocusRef = useRef<(() => void) | null>(null);
  const noteFocusRef = useRef<(() => void) | null>(null);

  const isEmpty = isPrivate ? !note.trim() : isReplyHtmlEmpty(html);
  const source = isPrivate ? note : html;

  const {
    savedAt: draftSavedAt,
    save: saveDraft,
    clear: clearDraft,
  } = useReplyDraftWriter({
    ticketId,
    agentId: currentAgentId,
    initialSavedAt: restoredDraft?.savedAt ?? null,
  });

  // Le champ ne contient encore que ce que l'application y a posé.
  const untouchedPrefill = html === autoInsertedHtml && !note.trim();

  // Le brouillon retrouvé est encore intact. Sert à deux choses : ne pas le
  // réenregistrer à l'identique en arrivant (l'heure affichée deviendrait celle de
  // l'ouverture du ticket), et retirer la mention qui l'annonce dès la première
  // correction — passé ce point, c'est ce qu'on est en train d'écrire.
  const draftIntact =
    restoredDraft !== null &&
    html === restoredDraft.html &&
    note === restoredDraft.note &&
    isPrivate === restoredDraft.isPrivate;

  useEffect(() => {
    if (untouchedPrefill || draftIntact) return;
    saveDraft({ html, note, isPrivate });
  }, [saveDraft, html, note, isPrivate, untouchedPrefill, draftIntact]);

  // Le rideau se lève tout seul. Un minuteur et non la fin d'une animation : il y
  // en a deux cent quarante qui se terminent à des instants différents, et aucune
  // sous `prefers-reduced-motion`.
  useEffect(() => {
    if (gameOverWord === null) return;
    const timer = setTimeout(() => setGameOverWord(null), GAME_OVER_MS);
    return () => clearTimeout(timer);
  }, [gameOverWord]);

  // setTimeout(0) : le champ ne se déverrouille qu'au rendu suivant, focus() avant
  // échouerait. Stable parce que la fenêtre d'attente l'appelle depuis un effet.
  const focusComposer = useCallback((privateMode: boolean) => {
    setTimeout(() => {
      const focus = privateMode ? noteFocusRef.current : editorFocusRef.current;
      focus?.();
    }, 0);
  }, []);

  // Le « @Prénom Nom » amorcé est ce qui notifie l'auteur de la note ; le lien vers
  // la note citée ne sert qu'à l'affichage. Rien n'est amorcé sur sa propre note,
  // ni par-dessus un texte déjà commencé.
  useEffect(
    () =>
      onReplyToNote((quote) => {
        setIsPrivate(true);
        if (quote.authorId && quote.authorId !== currentAgentId) {
          setNote((current) => (current.trim() ? current : `@${quote.author} `));
        }
        focusComposer(true);
      }),
    [onReplyToNote, currentAgentId, focusComposer]
  );

  const attachments = useReplyAttachments();

  const send = useReplySend({
    ticketId,
    sendDelaySeconds,
    isEmpty,
    // Les fichiers suivent le texte : ils quittent le formulaire avec lui et y
    // reviennent avec lui si l'envoi échoue.
    clearField: (privateMode) => {
      if (privateMode) setNote("");
      else setHtml("");
      attachments.clear();
    },
    restoreField: (reply) => {
      if (reply.isPrivate) setNote(reply.content);
      else setHtml(reply.contentHtml ?? "");
      attachments.restore(reply.files);
    },
    focusComposer,
    // La citation ne survit pas à la note qui la portait. Sur un échec d'envoi,
    // `onSent` n'est pas atteint : le texte revient dans le champ, la citation avec.
    onSent: () => {
      clearDraft();
      clearReplyTarget();
    },
  });

  const ai = useReplyAi({
    ticketId,
    aiEnabled,
    isPrivate,
    source,
    isEmpty,
    isQueued: send.isQueued,
    isSubmitting: send.isSubmitting,
    setSource: (text) => (isPrivate ? setNote(text) : setHtml(text)),
    focusComposer,
  });

  // Le champ est verrouillé pendant l'attente — ce qui part doit être ce qui a été
  // relu — et le temps d'une réécriture, dont le résultat remplace tout : ce qui
  // serait tapé entre-temps serait perdu sans trace.
  const isLocked = send.isQueued || ai.isRewriting;

  // Tout ce qui se juge sur le texte à l'écran se juge ici, et le message est figé
  // dans la foulée : rien en aval ne relit l'état du champ.
  function handleSubmit() {
    // `isRewriting` compris : envoyer pendant que l'IA reprend le message ferait
    // partir la version d'avant, et retomber la réécriture dans un champ vidé.
    if (isEmpty || send.isSubmitting || send.isQueued || ai.isRewriting) return;

    // Une réponse publique part sous ses deux formes : le HTML pour la mise en
    // forme, sa retranscription pour les boîtes mail qui ne l'affichent pas.
    const reply: PreparedReply = {
      content: isPrivate ? note : htmlToText(html),
      contentHtml: isPrivate ? null : html,
      isPrivate,
      replyToId: isPrivate ? (replyTarget?.messageId ?? null) : null,
      files: attachments.files,
    };

    // Le contrôle passe AVANT tout le reste : le champ ne se vide pas, le
    // brouillon n'est pas touché, rien ne part au serveur. Ce n'est pas une
    // interdiction — le clic suivant envoie le message tel quel (voir
    // `findInsult`).
    const insult = findInsult(reply.content);
    if (insult && !excusedInsults.current.has(insult)) {
      excusedInsults.current.add(insult);
      setGameOverWord(insult);
      playGameOverJingle();
      return;
    }

    send.startSend(reply);
  }

  const shortcuts = useReplyShortcuts({
    aiEnabled,
    isPrivate,
    isLocked,
    hasText: !isEmpty,
    rewriteIntent: ai.rewriteIntent,
    onSubmit: handleSubmit,
    onSuggest: () => void ai.suggest(),
    onRewrite: (intent) => void ai.rewrite(intent),
    focusComposer,
  });

  // Mesuré sur un brouillon NON VIDE et non sur le focus, pré-remplissage exclu :
  // sinon l'indicateur annonce « il rédige » à l'ouverture de chaque fiche.
  const composing = !isEmpty && !untouchedPrefill;
  const others = useTicketPresence({ ticketId, composing });

  // Le texte déjà écrit n'est jamais remplacé : la réponse type s'ajoute à la
  // suite, en paragraphes à part.
  function insertCannedResponse(body: string) {
    setHtml(appendReplyHtml(html, textToReplyHtml(body)));
  }

  // Une réponse publique part au client : elle ne cite pas la note interne qui
  // l'avait préparée.
  function changeMode(privateMode: boolean) {
    setIsPrivate(privateMode);
    if (!privateMode) clearReplyTarget();
  }

  function discardDraft() {
    setHtml(autoInsertedHtml);
    setNote("");
    clearDraft();
  }

  return {
    html,
    setHtml,
    note,
    setNote,
    isPrivate,
    setIsPrivate: changeMode,
    isEmpty,
    isLocked,
    others,
    editorFocusRef,
    noteFocusRef,
    // Brouillon et pré-remplissage
    draftSavedAt,
    draftIntact,
    // Pourquoi il y a déjà du texte dans le champ. Disparaît à la première frappe :
    // passé ce point le brouillon est celui de l'agent.
    prefilledTitle:
      !isPrivate && autoInserted !== null && html === autoInsertedHtml
        ? autoInserted.title
        : null,
    discardDraft,
    insertCannedResponse,
    // Pièces jointes de la réponse en cours
    attachments,
    // Note citée, et le moyen de renoncer à la citer.
    replyTarget,
    clearReplyTarget,
    // Envoi
    send,
    handleSubmit,
    gameOverWord,
    // Assistant et clavier
    ai,
    shortcuts,
  };
}
