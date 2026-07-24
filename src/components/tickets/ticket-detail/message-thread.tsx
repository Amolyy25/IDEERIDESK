"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveMessage, rejectMessage } from "@/lib/actions/tickets";
import type { TicketWithMessages } from "@/lib/actions/tickets";

export function MessageThread({
  messages,
  canApprove,
}: {
  messages: TicketWithMessages["messages"];
  canApprove: boolean;
}) {
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
    return <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-lg border p-4",
            message.isPrivate ? "border-primary/40 bg-primary/5" : "bg-card"
          )}
        >
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              {message.agent?.name ?? (message.authorType === "CLIENT" ? "Client" : "Système")}
              {message.isPrivate && " · Note interne"}
              {message.emailSent && (
                <span className="ml-1 flex items-center gap-1 text-muted-foreground" title="Envoyé par email">
                  <Mail className="h-3 w-3" />
                </span>
              )}
              {message.approvalStatus === "PENDING" && (
                <Badge variant="secondary">En attente de validation</Badge>
              )}
              {message.approvalStatus === "REJECTED" && (
                <Badge variant="outline">Rejeté, non envoyé</Badge>
              )}
            </span>
            <span>{formatDateTime(message.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{message.content}</p>

          {message.approvalStatus === "PENDING" && canApprove && (
            <div className="mt-3 flex gap-2 border-t pt-3">
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
          )}
        </div>
      ))}
    </div>
  );
}
