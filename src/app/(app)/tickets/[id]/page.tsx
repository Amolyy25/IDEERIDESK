import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { StatusDot } from "@/components/tickets/status-dot";
import { SourceBadge } from "@/components/tickets/source-badge";
import { formatDateTime } from "@/lib/format-date";
import { AttributesPanel } from "@/components/tickets/ticket-detail/attributes-panel";
import { MessageThread } from "@/components/tickets/ticket-detail/message-thread";
import { ReplyBox } from "@/components/tickets/ticket-detail/reply-box";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { MarkAsRead } from "@/components/tickets/ticket-detail/mark-as-read";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, ticket, statuses, priorities, categories, agents, customFields] = await Promise.all([
    auth(),
    getTicketById(id),
    getTicketStatuses(),
    getTicketPriorities(),
    getTicketCategories(),
    getAgents(),
    getCustomFields(),
  ]);

  if (!ticket) {
    notFound();
  }

  const activeCustomFields = customFields.filter((field) => field.isActive);

  return (
    <div className="flex h-full">
      <MarkAsRead ticketId={ticket.id} hasUnreadActivity={ticket.hasUnreadActivity} />
      <div className="flex-1 overflow-y-auto p-6">
        <Link
          href="/tickets"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tickets
        </Link>

        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">#{ticket.number}</span>
          <StatusDot color={ticket.status.color} label={ticket.status.name} />
          <StatusDot color={ticket.priority.color} label={ticket.priority.name} />
          <SourceBadge source={ticket.source} />
        </div>

        <h1 className="mb-1 text-xl font-semibold">{ticket.subject}</h1>
        <p className="mb-6 text-xs text-muted-foreground">
          Créé le {formatDateTime(ticket.createdAt)}
        </p>

        <div className="mb-6 rounded-lg border bg-card p-4">
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        </div>

        <AttachmentsList attachments={ticket.attachments} />

        <h2 className="mb-3 text-sm font-medium">Conversation</h2>
        <MessageThread messages={ticket.messages} />

        <div className="mt-4">
          <ReplyBox
            ticketId={ticket.id}
            currentAgentName={session?.user?.name || session?.user?.email || "Agent"}
          />
        </div>
      </div>

      <AttributesPanel
        ticket={ticket}
        statuses={statuses}
        priorities={priorities}
        categories={categories}
        agents={agents}
        customFields={activeCustomFields}
      />
    </div>
  );
}
