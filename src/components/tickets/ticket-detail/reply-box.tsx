"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import type { MentionableAgent } from "@/lib/mentions";

export function ReplyBox({
  ticketId,
  currentAgentName,
  canRespond,
  requiresApproval,
  agents,
}: {
  ticketId: string;
  currentAgentName: string;
  canRespond: boolean;
  requiresApproval: boolean;
  /** Agents mentionnables en @ dans une note interne. */
  agents: MentionableAgent[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  async function handleSuggest() {
    setIsSuggesting(true);
    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Impossible de générer une suggestion.");
      }
      setContent(result.suggestion);
      toast.success("Suggestion générée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de générer une suggestion.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleSubmit() {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await addTicketMessage(ticketId, { content, isPrivate });
      setContent("");

      if (isPrivate && result.mentionedNames.length > 0) {
        toast.success(
          `Note ajoutée · ${result.mentionedNames.join(", ")} notifié${
            result.mentionedNames.length > 1 ? "s" : ""
          } par email`
        );
      }

      if (!isPrivate) {
        if (result.pendingApproval) {
          toast.info("Réponse envoyée pour validation, en attente d'un agent habilité.");
        } else if (result.emailSent) {
          toast.success("Réponse envoyée par email");
        } else {
          toast.warning(
            `Réponse enregistrée, mais non envoyée par email${
              result.emailSkippedReason ? ` (${result.emailSkippedReason})` : ""
            }`
          );
        }
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'envoyer le message");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canRespond) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Accès en lecture seule — vous ne pouvez pas répondre à ce ticket.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-4 transition-colors",
        // Même code couleur que les notes internes du fil : impossible de se
        // tromper sur ce que le client verra.
        isPrivate && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="inline-flex rounded-md border bg-background p-0.5">
        <button
          type="button"
          onClick={() => setIsPrivate(false)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
            !isPrivate
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Réponse publique
        </button>
        <button
          type="button"
          onClick={() => setIsPrivate(true)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
            isPrivate
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Note interne
        </button>
      </div>

      {/* L'autocomplétion des mentions n'est montée que sur la note interne :
          un @ dans une réponse publique ne notifie personne, proposer la liste
          de l'équipe y serait un piège. */}
      {isPrivate ? (
        <MentionTextarea
          value={content}
          onChange={setContent}
          agents={agents}
          placeholder="Écrire une note interne… (@ pour mentionner un collègue)"
          rows={4}
        />
      ) : (
        <Textarea
          placeholder="Répondre au client…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isPrivate ? "Note visible par l'équipe" : "Répond en tant que"}{" "}
          <span className="font-medium text-foreground">{currentAgentName}</span>
          {!isPrivate && requiresApproval && " · nécessite une validation"}
          {isPrivate && " · tapez @ pour notifier un collègue"}
        </p>

        <div className="flex items-center gap-2">
          {!isPrivate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              disabled={isSuggesting}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isSuggesting ? "Génération…" : "Suggérer une réponse"}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting || !content.trim()} size="sm">
            {isSubmitting
              ? "Envoi…"
              : isPrivate
                ? "Ajouter la note"
                : requiresApproval
                  ? "Envoyer pour validation"
                  : "Envoyer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
