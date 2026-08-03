import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getSourceFields } from "@/lib/actions/sources";
import { resolveSignatureHtmlForAgent } from "@/lib/signature-store";
import { AttributesPanel } from "@/components/tickets/ticket-detail/attributes-panel";
import { TicketHeader } from "@/components/tickets/ticket-detail/ticket-header";
import { MessageThread } from "@/components/tickets/ticket-detail/message-thread";
import { ReplyBox } from "@/components/tickets/ticket-detail/reply-box";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { EmailOrigin } from "@/components/tickets/ticket-detail/email-origin";
import { MarkAsRead } from "@/components/tickets/ticket-detail/mark-as-read";
import { SignatureBlock } from "@/components/tickets/ticket-detail/signature-block";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import { Timeline, TimelineItem } from "@/components/tickets/ticket-detail/timeline-item";

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
  // Signature qui sera ajoutée aux réponses de cet agent (voir
  // /settings/signatures), affichée telle quelle sous la zone de réponse : la
  // même fonction qu'à l'envoi, donc ce qui est montré est exactement ce qui
  // partira.
  const signatureHtml = await resolveSignatureHtmlForAgent(session?.user?.id ?? null);

  return (
    <div className="flex h-full">
      <MarkAsRead ticketId={ticket.id} hasUnreadActivity={ticket.hasUnreadActivity} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TicketHeader ticket={ticket} currentAgentId={session?.user?.id ?? null} />

        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {/* Un seul fil, ouvert par la demande d'origine : celle-ci est le
              premier tour de la conversation, la détacher dans un encadré à part
              obligeait à comparer deux mises en forme pour suivre l'échange. */}
          <Timeline>
            <TimelineItem
              avatar={<AuthorAvatar name={ticket.client?.name ?? "Client"} kind="client" />}
              author={ticket.client?.name ?? "Demande initiale"}
              date={ticket.createdAt}
              tone="inbound"
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              <AttachmentsList attachments={ticket.attachments} />
              {/* Les en-têtes du mail d'origine appartiennent à cette demande :
                  repliés ici, et non en bloc autonome au-dessus du fil. */}
              <EmailOrigin metadata={ticket.metadata} />
            </TimelineItem>

            <MessageThread
              messages={ticket.messages}
              canApprove={session?.user?.canApprove ?? false}
              agents={mentionableAgents}
              currentAgentId={session?.user?.id ?? null}
            />
          </Timeline>

          {/* Aligné sur les cartes du fil (largeur de la pastille + son écart) :
              la zone de rédaction est le prochain tour de la conversation. */}
          <div className="mt-4 pl-11">
            <ReplyBox
              ticketId={ticket.id}
              currentAgentName={session?.user?.name || session?.user?.email || "Agent"}
              clientEmail={ticket.client?.email ?? null}
              canRespond={session?.user?.canRespond ?? false}
              requiresApproval={session?.user?.requiresApproval ?? false}
              signature={signatureHtml && <SignatureBlock html={signatureHtml} />}
              agents={mentionableAgents}
            />
          </div>
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
