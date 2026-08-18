"use client";

import { useState } from "react";
import { toast } from "sonner";
import { rewriteMessage, suggestReply } from "@/lib/api/ai-composer";
import {
  DEFAULT_REWRITE_INTENT,
  MAX_REWRITE_INPUT_CHARS,
  findRewriteIntent,
  type RewriteIntentId,
} from "@/lib/ai-rewrite";
import { textToReplyHtml } from "@/lib/reply-html";

// L'IA REMPLACE le texte du champ : la version précédente est gardée pour le retour
// arrière, tant que le texte produit n'a pas été retouché.
type AiEdit = {
  /** Ce qui est annoncé sous le champ : l'intention choisie, ou la suggestion. */
  label: string;
  isPrivate: boolean;
  previous: string;
  produced: string;
};

type UseReplyAiOptions = {
  ticketId: string;
  aiEnabled: boolean;
  isPrivate: boolean;
  /** Le texte du mode en cours : la note, ou le HTML de la réponse. */
  source: string;
  isEmpty: boolean;
  isQueued: boolean;
  isSubmitting: boolean;
  setSource: (text: string) => void;
  focusComposer: (privateMode: boolean) => void;
};

export function useReplyAi({
  ticketId,
  aiEnabled,
  isPrivate,
  source,
  isEmpty,
  isQueued,
  isSubmitting,
  setSource,
  focusComposer,
}: UseReplyAiOptions) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  // La dernière intention utilisée, que la touche Tab rejoue : on raccourcit
  // rarement une seule fois, et revenir à la correction par défaut reviendrait à
  // ne se servir du raccourci que pour la première passe.
  const [rewriteIntent, setRewriteIntent] = useState<RewriteIntentId>(DEFAULT_REWRITE_INTENT);
  const [aiEdit, setAiEdit] = useState<AiEdit | null>(null);

  // Le champ contient encore exactement ce que l'IA a produit : passé la première
  // correction, proposer le retour arrière emporterait le travail de l'agent.
  const visibleAiEdit =
    aiEdit !== null && aiEdit.isPrivate === isPrivate && source === aiEdit.produced
      ? aiEdit
      : null;

  // Centralise tout ce que l'IA écrit (suggestion ou réécriture) pour garder
  // l'ancienne version disponible.
  function applyAiEdit(edit: AiEdit) {
    setSource(edit.produced);
    setAiEdit(edit);
    // Le curseur revient dans le texte, prêt à corriger : le champ avait perdu la
    // main en se verrouillant.
    focusComposer(edit.isPrivate);
  }

  function undoAiEdit() {
    if (!aiEdit) return;
    setSource(aiEdit.previous);
    setAiEdit(null);
  }

  async function suggest() {
    // Réservée à la réponse publique : elle écrit dans le champ du client, et ne
    // saurait pas quoi proposer pour une note d'équipe.
    if (!aiEnabled || isPrivate || isSuggesting || isQueued || isRewriting) return;

    setIsSuggesting(true);
    try {
      const suggestion = await suggestReply(ticketId);
      // La suggestion arrive en texte brut : convertie en paragraphes, sinon une
      // réponse de dix lignes atterrit dans l'éditeur en un seul bloc.
      applyAiEdit({
        label: "Suggestion complète",
        isPrivate: false,
        previous: source,
        produced: textToReplyHtml(suggestion),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de générer une suggestion."
      );
    } finally {
      setIsSuggesting(false);
    }
  }

  // Touche Tab, ou menu « Réécrire ». L'intention choisie devient celle du
  // raccourci : on converge en trois appuis sans rouvrir le menu à chaque essai.
  async function rewrite(intent: RewriteIntentId, instruction?: string) {
    if (!aiEnabled || isRewriting || isSuggesting || isQueued || isSubmitting) return;
    // Rien à reprendre : le raccourci se tait plutôt que d'annoncer une erreur.
    if (isEmpty) return;

    // Arrêté ici et non par le serveur : « Requête invalide » n'apprendrait rien à
    // un agent qui vient de coller trois pages de journal d'erreurs.
    if (source.length > MAX_REWRITE_INPUT_CHARS) {
      toast.error("Message trop long pour être réécrit par l'IA.");
      return;
    }

    const label =
      intent === "custom" ? (instruction ?? "").trim() : findRewriteIntent(intent).label;

    setRewriteIntent(intent);
    setIsRewriting(true);
    try {
      const produced = await rewriteMessage({
        ticketId,
        text: source,
        // Une note interne est du texte brut de bout en bout ; une réponse
        // publique garde sa mise en forme, listes et liens compris.
        format: isPrivate ? "text" : "html",
        intent,
        instruction,
      });

      // Cas courant d'une correction sur un texte déjà propre. Le dire, sinon
      // l'agent relit son message en cherchant ce qui a changé.
      if (produced.trim() === source.trim()) {
        toast.info("Rien à reprendre : le message est laissé tel quel.");
        focusComposer(isPrivate);
        return;
      }

      applyAiEdit({ label, isPrivate, previous: source, produced });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de réécrire le message."
      );
    } finally {
      setIsRewriting(false);
    }
  }

  return {
    isSuggesting,
    isRewriting,
    rewriteIntent,
    visibleAiEdit,
    suggest,
    rewrite,
    undoAiEdit,
  };
}
