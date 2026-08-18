import type { MergedTicket, TicketWithMessages } from "@/lib/actions/tickets";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { EmailOrigin } from "@/components/tickets/ticket-detail/email-origin";
import { TimelineItem } from "@/components/tickets/ticket-detail/timeline-item";

// Les demandes qui ouvrent une conversation : celle du ticket, et celle de chaque
// doublon fusionné. Ni l'une ni l'autre n'est un message en base — d'où ces deux
// entrées de ligne de temps rendues à partir du ticket lui-même.

/** La demande qui a ouvert le ticket : premier tour de la conversation, pas un encadré à part. */
export function InitialRequest({ ticket }: { ticket: TicketWithMessages }) {
  return (
    <TimelineItem
      avatar={<AuthorAvatar name={ticket.client?.name ?? "Client"} kind="client" />}
      author={ticket.client?.name ?? "Demande initiale"}
      date={ticket.createdAt}
      tone="inbound"
    >
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
      <AttachmentsList attachments={ticket.attachments} />
      {/* Les en-têtes du mail d'origine appartiennent à cette demande : repliés
          ici, et non en bloc autonome au-dessus du fil. */}
      <EmailOrigin metadata={ticket.metadata} />
    </TimelineItem>
  );
}

export function DuplicateInitialRequest({ duplicate }: { duplicate: MergedTicket }) {
  const author = duplicate.client?.name ?? "Demande initiale";

  return (
    <TimelineItem
      avatar={<AuthorAvatar name={author} kind="client" />}
      author={author}
      date={duplicate.createdAt}
      tone="inbound"
      align="right"
    >
      <p className="text-sm font-medium">{duplicate.subject}</p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{duplicate.description}</p>
      <AttachmentsList attachments={duplicate.attachments} />
    </TimelineItem>
  );
}
