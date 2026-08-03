import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getSourceFields } from "@/lib/actions/sources";
import { formatDateTime } from "@/lib/format-date";
import { AttributesPanel } from "@/components/tickets/ticket-detail/attributes-panel";
import { TicketHeader } from "@/components/tickets/ticket-detail/ticket-header";
import { MessageThread } from "@/components/tickets/ticket-detail/message-thread";
import { ReplyBox } from "@/components/tickets/ticket-detail/reply-box";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { EmailOrigin } from "@/components/tickets/ticket-detail/email-origin";
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
  // Agents mentionnables en @ dans une note interne : même liste que
  // l'assignation, réduite à ce dont le parseur de mentions a besoin.
  const mentionableAgents = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    email: agent.email,
  }));
  // Champs du formulaire par lequel le ticket est arrivé : sert à afficher les
  // réponses collectées, stockées dans `metadata` sous la clé de chaque champ.
  const sourceFields = ticket.formSourceId ? await getSourceFields(ticket.formSourceId) : [];

  return (
    <div className="flex h-full">
      <MarkAsRead ticketId={ticket.id} hasUnreadActivity={ticket.hasUnreadActivity} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TicketHeader ticket={ticket} currentAgentId={session?.user?.id ?? null} />

        <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
          {/* La demande d'origine ouvre le fil : même forme qu'un message, avec
              son auteur et sa date, plutôt qu'un encadré anonyme détaché. */}
          <article className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {ticket.client?.name ?? "Demande initiale"}
              </span>
              <span>{formatDateTime(ticket.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            <AttachmentsList attachments={ticket.attachments} />
          </article>

          {/* Uniquement pour les tickets nés d'un email entrant : en-têtes du mail
              d'origine, juste sous la demande qu'ils décrivent. */}
          <EmailOrigin metadata={ticket.metadata} />

          <section className="space-y-3">
            <h2 className="text-sm font-medium">
              Conversation
              {ticket.messages.length > 0 && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {ticket.messages.length}
                </span>
              )}
            </h2>
            <MessageThread
              messages={ticket.messages}
              canApprove={session?.user?.canApprove ?? false}
              agents={mentionableAgents}
              currentAgentId={session?.user?.id ?? null}
            />
          </section>

          <ReplyBox
            ticketId={ticket.id}
            currentAgentName={session?.user?.name || session?.user?.email || "Agent"}
            canRespond={session?.user?.canRespond ?? false}
            requiresApproval={session?.user?.requiresApproval ?? false}
            agents={mentionableAgents}
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
        sourceFields={sourceFields}
      />
    </div>
  );
}
