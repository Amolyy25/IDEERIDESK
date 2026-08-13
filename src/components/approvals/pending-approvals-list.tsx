"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveMessage, rejectMessage } from "@/lib/actions/tickets";
import type { PendingApprovalMessage } from "@/lib/actions/tickets";
import { formatDateTime } from "@/lib/format-date";
import { MessageBody } from "@/components/tickets/ticket-detail/message-body";

export function PendingApprovalsList({ messages }: { messages: PendingApprovalMessage[] }) {
  const router = useRouter();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  async function handleApprove(messageId: string) {
    setPendingActionId(messageId);
    try {
      const result = await approveMessage(messageId);
      if (result.emailSent) {
        toast.success("Réponse validée et envoyée par email");
      } else {
        toast.warning(
          `Réponse validée, mais non envoyée par email${
            result.emailSkippedReason ? ` (${result.emailSkippedReason})` : ""
          }`
        );
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Validation impossible");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleReject(messageId: string) {
    setPendingActionId(messageId);
    try {
      await rejectMessage(messageId);
      toast.success("Réponse rejetée, non envoyée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejet impossible");
    } finally {
      setPendingActionId(null);
    }
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Aucune réponse en attente de validation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <article key={message.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Link
              href={`/tickets/${message.ticket.id}`}
              className="min-w-0 text-sm font-medium hover:underline"
            >
              <span className="font-mono text-muted-foreground">#{message.ticket.number}</span>{" "}
              {message.ticket.subject}
            </Link>
            <span className="text-xs text-muted-foreground">
              En attente depuis le {formatDateTime(message.createdAt)}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Rédigée par {message.agent?.name ?? "un agent"}
            {message.ticket.client?.name ? ` · pour ${message.ticket.client.name}` : ""}
          </p>

          {/* La réponse telle qu'elle partira, mise en forme comprise : c'est
              exactement ce qui est soumis à validation, une version aplatie
              ferait valider autre chose que ce que le client recevra. */}
          <MessageBody
            content={message.content}
            contentHtml={message.contentHtml}
            className="mt-3 rounded-md border bg-muted/40 p-3"
          />

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => handleApprove(message.id)}
              disabled={pendingActionId === message.id}
            >
              Approuver et envoyer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReject(message.id)}
              disabled={pendingActionId === message.id}
            >
              Rejeter
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
