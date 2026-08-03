"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveMessage, rejectMessage } from "@/lib/actions/tickets";
import type { TicketWithMessages } from "@/lib/actions/tickets";
import { MentionText } from "@/components/tickets/ticket-detail/mention-text";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import type { MentionableAgent } from "@/lib/mentions";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import type { AuthorKind } from "@/components/tickets/ticket-detail/author-avatar";
import {
  TimelineEvent,
  TimelineItem,
  type TimelineTone,
} from "@/components/tickets/ticket-detail/timeline-item";

type Message = TicketWithMessages["messages"][number];

/** Ce que le message est, du point de vue de qui l'a écrit et de qui le reçoit. */
function describe(message: Message): { author: string; kind: AuthorKind; tone: TimelineTone } {
  if (message.authorType === "CLIENT") {
    return { author: "Client", kind: "client", tone: "inbound" };
  }

  const author = message.agent?.name ?? "Agent";
  if (message.isPrivate) {
    return { author, kind: "agent", tone: "internal" };
  }
  return { author, kind: "agent", tone: "outbound" };
}

/**
 * Le fil des réponses, rendu en entrées de la ligne de temps ouverte par la
 * demande initiale (voir `Timeline` dans la page du ticket) : ce composant rend
 * donc des `<li>`, pas sa propre liste.
 */
export function MessageThread({
  messages,
  canApprove,
  agents,
  currentAgentId,
}: {
  messages: Message[];
  canApprove: boolean;
  /** Équipe utilisée pour surligner les mentions des notes internes. */
  agents: MentionableAgent[];
  currentAgentId: string | null;
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

  return (
    <>
      {messages.map((message) => {
        // Les messages de service (accusé de réception, échec d'envoi) sont des
        // repères, pas des tours de parole.
        if (message.authorType === "SYSTEM") {
          return (
            <TimelineEvent key={message.id} date={message.createdAt}>
              {message.content}
            </TimelineEvent>
          );
        }

        const { author, kind, tone } = describe(message);

        return (
          <TimelineItem
            key={message.id}
            avatar={<AuthorAvatar name={author} kind={kind} imageUrl={message.agent?.avatarUrl} />}
            author={author}
            date={message.createdAt}
            tone={tone}
            meta={<MessageBadges message={message} />}
            footer={
              message.approvalStatus === "PENDING" &&
              canApprove && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(message.id)}
                    disabled={pendingActionId === message.id}
                  >
                    <Check className="size-4" />
                    Approuver et envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(message.id)}
                    disabled={pendingActionId === message.id}
                  >
                    <X className="size-4" />
                    Rejeter
                  </Button>
                </div>
              )
            }
          >
            {/* Seules les notes internes portent des mentions : une réponse
                publique ne notifie personne, rien à surligner. */}
            {message.isPrivate ? (
              <MentionText
                content={message.content}
                agents={agents}
                currentAgentId={currentAgentId}
              />
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            )}

            {/* Les fichiers du tour de conversation, sous le message dont ils
                proviennent : regroupés au niveau du ticket, on ne savait plus
                lequel accompagnait quelle réponse. */}
            <AttachmentsList attachments={message.attachments} />
          </TimelineItem>
        );
      })}
    </>
  );
}

/** État d'un message : ce qui a été envoyé, ce qui attend, ce qui a été refusé. */
function MessageBadges({ message }: { message: Message }) {
  return (
    <>
      {message.isPrivate && (
        <Badge variant="outline" className="border-primary/40 text-[11px] font-normal">
          Note interne
        </Badge>
      )}
      {message.emailSent && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          title="Envoyé au client par email"
        >
          <Mail className="size-3.5" />
          Envoyé
        </span>
      )}
      {message.approvalStatus === "PENDING" && (
        <Badge variant="secondary" className="text-[11px] font-normal">
          En attente de validation
        </Badge>
      )}
      {message.approvalStatus === "REJECTED" && (
        <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
          Rejetée, non envoyée
        </Badge>
      )}
    </>
  );
}
