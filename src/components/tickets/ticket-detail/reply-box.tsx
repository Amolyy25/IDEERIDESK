"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn } from "@/lib/utils";

export function ReplyBox({ ticketId, currentAgentName }: { ticketId: string; currentAgentName: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await addTicketMessage(ticketId, { content, isPrivate });
      setContent("");

      if (!isPrivate) {
        if (result.emailSent) {
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

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="inline-flex rounded-md border p-0.5">
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

      <Textarea
        placeholder={isPrivate ? "Écrire une note interne…" : "Répondre au client…"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isPrivate ? "Note visible par l'équipe" : "Répond en tant que"}{" "}
          <span className="font-medium text-foreground">{currentAgentName}</span>
        </p>

        <Button onClick={handleSubmit} disabled={isSubmitting || !content.trim()} size="sm">
          {isSubmitting ? "Envoi…" : isPrivate ? "Ajouter la note" : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
