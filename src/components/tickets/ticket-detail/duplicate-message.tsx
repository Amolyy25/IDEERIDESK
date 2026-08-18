import { Badge } from "@/components/ui/badge";
import type { MergedTicketMessage } from "@/lib/actions/tickets";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { MessageBody } from "@/components/tickets/ticket-detail/message-body";
import {
  TimelineItem,
  type TimelineAlign,
} from "@/components/tickets/ticket-detail/timeline-item";

/**
 * Un message d'un doublon. Rendu à part des messages du ticket : ceux-là n'ont
 * ni note interne ni validation à afficher, et portent l'étiquette du ticket
 * dont ils viennent quand ils remontent dans la colonne commune.
 */
export function DuplicateMessage({
  message,
  clientName,
  align = "left",
  origin,
}: {
  message: MergedTicketMessage;
  clientName: string | null;
  align?: TimelineAlign;
  /** Numéro du doublon, affiché quand le message est sorti de sa colonne. */
  origin?: number;
}) {
  let author = message.agent?.name ?? "Agent";
  let kind: "client" | "agent" = "agent";
  let tone: "inbound" | "outbound" = "outbound";

  if (message.authorType === "CLIENT") {
    author = clientName ?? "Client";
    kind = "client";
    tone = "inbound";
  }

  return (
    <TimelineItem
      avatar={<AuthorAvatar name={author} kind={kind} imageUrl={message.agent?.avatarUrl} />}
      author={author}
      date={message.createdAt}
      tone={tone}
      align={align}
      meta={<DuplicateMessageBadges emailSent={message.emailSent} origin={origin} />}
    >
      <MessageBody content={message.content} contentHtml={message.contentHtml} />
      <AttachmentsList attachments={message.attachments} />
    </TimelineItem>
  );
}

function DuplicateMessageBadges({
  emailSent,
  origin,
}: {
  emailSent: boolean;
  origin?: number;
}) {
  return (
    <>
      {/* Sans cette étiquette, une relance arrivée sur un doublon se lirait comme
          une réponse du client de ce ticket-ci. */}
      {origin !== undefined && (
        <Badge variant="outline" className="text-[11px] font-normal">
          via #{origin}
        </Badge>
      )}
      {emailSent && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          title="Envoyé à ce client par email"
        >
          Envoyé
        </span>
      )}
    </>
  );
}
