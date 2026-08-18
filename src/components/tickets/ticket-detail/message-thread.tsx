"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveMessage, rejectMessage } from "@/lib/actions/ticket-approvals";
import type { TicketWithMessages } from "@/lib/actions/tickets";
import { MentionText } from "@/components/tickets/ticket-detail/mention-text";
import { MessageBody } from "@/components/tickets/ticket-detail/message-body";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import type { MentionableAgent } from "@/lib/mentions";
import { noteAnchor, type NoteQuote } from "@/lib/note-replies";
import { QuotedNote, ReplyToNoteButton } from "@/components/tickets/ticket-detail/note-reply";
import { plural } from "@/lib/utils";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import type { AuthorKind } from "@/components/tickets/ticket-detail/author-avatar";
import {
  TimelineEvent,
  TimelineItem,
  type TimelineAlign,
  type TimelineTone,
} from "@/components/tickets/ticket-detail/timeline-item";

export type Message = TicketWithMessages["messages"][number];

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
 * Une réponse du fil, rendue comme entrée de la ligne de temps.
 *
 * Chaque message porte lui-même son état de validation en cours : le compteur
 * partagé d'avant obligeait tous les messages du fil à se redessiner dès qu'on
 * en approuvait un, et empêchait de réutiliser ce rendu ailleurs — or il sert
 * maintenant dans trois colonnes différentes (voir `TicketThread`).
 */
export function MessageTimelineItem({
  message,
  canApprove,
  canReply,
  quote,
  agents,
  currentAgentId,
  align = "left",
  /** Doublon d'où provient ce message, quand il n'a pas été écrit sur ce ticket. */
  origin,
}: {
  message: Message;
  canApprove: boolean;
  /** Permission « tickets.respond » : sans elle, aucune note à qui répondre. */
  canReply: boolean;
  /** Note citée par ce message, quand il répond à une autre note. */
  quote?: NoteQuote;
  agents: MentionableAgent[];
  currentAgentId: string | null;
  align?: TimelineAlign;
  origin?: { number: number; clientName: string | null };
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleApprove() {
    setIsPending(true);
    try {
      announceApproval(await approveMessage(message.id));
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Validation impossible"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleReject() {
    setIsPending(true);
    try {
      await rejectMessage(message.id);
      toast.success("Réponse rejetée, non envoyée");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Rejet impossible"));
    } finally {
      setIsPending(false);
    }
  }

  // Les messages de service (accusé de réception, échec d'envoi) sont des
  // repères, pas des tours de parole.
  if (message.authorType === "SYSTEM") {
    return (
      <TimelineEvent date={message.createdAt} align={align}>
        {message.content}
      </TimelineEvent>
    );
  }

  const { author, kind, tone } = describe(message);

  let footer = null;
  if (message.approvalStatus === "PENDING" && canApprove) {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleApprove} disabled={isPending}>
          <Check className="size-4" />
          Approuver et envoyer
        </Button>
        <Button size="sm" variant="outline" onClick={handleReject} disabled={isPending}>
          <X className="size-4" />
          Rejeter
        </Button>
      </div>
    );
  } else if (message.isPrivate && canReply) {
    // Réservé aux notes : une réponse publique s'adresse au client, elle n'attend
    // pas d'être reprise entre agents.
    footer = <ReplyToNoteButton message={message} />;
  }

  return (
    <TimelineItem
      avatar={<AuthorAvatar name={author} kind={kind} imageUrl={message.agent?.avatarUrl} />}
      author={author}
      date={message.createdAt}
      tone={tone}
      align={align}
      meta={<MessageBadges message={message} origin={origin} />}
      footer={footer}
      // Seules les notes sont citées ou pointées par la cloche : leur seule ancre
      // suffit, en poser une sur chaque message n'aurait aucune cible.
      anchorId={message.isPrivate ? noteAnchor(message.id) : undefined}
    >
      {quote && <QuotedNote quote={quote} />}

      {/* Seules les notes internes portent des mentions : une réponse publique ne
          notifie personne, rien à surligner. */}
      {message.isPrivate ? (
        <MentionText content={message.content} agents={agents} currentAgentId={currentAgentId} />
      ) : (
        <MessageBody content={message.content} contentHtml={message.contentHtml} />
      )}

      {/* Les fichiers du tour de conversation, sous le message dont ils
          proviennent : regroupés au niveau du ticket, on ne savait plus lequel
          accompagnait quelle réponse. */}
      <AttachmentsList attachments={message.attachments} />
    </TimelineItem>
  );
}

/**
 * Une suite de réponses. Ne rend que des `<li>` : la liste elle-même est tenue
 * par la `Timeline` de l'appelant, qui sait de quelle colonne il s'agit.
 */
export function MessageThread({
  messages,
  canApprove,
  canReply,
  quotes,
  agents,
  currentAgentId,
  align = "left",
}: {
  messages: Message[];
  canApprove: boolean;
  canReply: boolean;
  /** Notes citées du fil entier, indexées par la réponse qui les porte. */
  quotes: Map<string, NoteQuote>;
  /** Équipe utilisée pour surligner les mentions des notes internes. */
  agents: MentionableAgent[];
  currentAgentId: string | null;
  align?: TimelineAlign;
}) {
  return (
    <>
      {messages.map((message) => (
        <MessageTimelineItem
          key={message.id}
          message={message}
          canApprove={canApprove}
          canReply={canReply}
          quote={quotes.get(message.id)}
          agents={agents}
          currentAgentId={currentAgentId}
          align={align}
        />
      ))}
    </>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Ce qu'une validation a déclenché. Même règle que pour un envoi direct (voir
 * `announceReply` dans la zone de réponse) : les clients des doublons comptent,
 * et le silence sur leur nombre serait un envoi masqué.
 */
function announceApproval(result: {
  emailSent: boolean;
  emailSkippedReason: string | null;
  alsoSentTo: number;
}) {
  const extra = result.alsoSentTo;

  if (result.emailSent || extra > 0) {
    if (extra === 0) {
      toast.success("Réponse validée et envoyée par email");
      return;
    }
    toast.success(
      `Réponse validée et envoyée par email · ${extra} client${plural(extra)} de ticket${plural(
        extra
      )} fusionné${plural(extra)} également`
    );
    return;
  }

  if (result.emailSkippedReason) {
    toast.warning(`Réponse validée, mais non envoyée par email (${result.emailSkippedReason})`);
    return;
  }
  toast.warning("Réponse validée, mais non envoyée par email");
}

/** État d'un message : ce qui a été envoyé, ce qui attend, ce qui a été refusé. */
function MessageBadges({
  message,
  origin,
}: {
  message: Message;
  origin?: { number: number; clientName: string | null };
}) {
  return (
    <>
      {/* Un message arrivé sur un doublon après la fusion : sans cette étiquette,
          il se lirait comme une réponse du client de ce ticket-ci. */}
      {origin && (
        <Badge variant="outline" className="text-[11px] font-normal">
          via #{origin.number}
          {origin.clientName && ` · ${origin.clientName}`}
        </Badge>
      )}
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
