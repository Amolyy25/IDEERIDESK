import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";
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
import { TicketThread } from "@/components/tickets/ticket-detail/ticket-thread";
import { ReplyBox } from "@/components/tickets/ticket-detail/reply-box";
import { MarkAsRead } from "@/components/tickets/ticket-detail/mark-as-read";
import { LogTicketView } from "@/components/tickets/ticket-detail/log-ticket-view";
import { SignatureBlock } from "@/components/tickets/ticket-detail/signature-block";
import { DuplicateBanner } from "@/components/tickets/ticket-detail/duplicate-banner";
import { MergedIntoBanner } from "@/components/tickets/ticket-detail/merged-tickets";
import {
  listCannedResponsesForTicket,
  type TicketCannedResponses,
} from "@/lib/canned-responses";
import { getPendingDuplicateSuggestions } from "@/lib/ticket-duplicates";
import { readReplySendDelaySeconds } from "@/lib/reply-send-delay";
import { getAiConfig } from "@/lib/ai-settings";
import { resolveMergeRoot } from "@/lib/ticket-merge";
import { countMergedRecipients, listDossierClients } from "@/lib/ticket-dossier";
import { cn } from "@/lib/utils";

/**
 * Largeur du fil selon le nombre de conversations qu'il porte de front.
 *
 * Bornée volontairement : au-delà de deux doublons, élargir encore rendrait
 * chaque colonne plus étroite qu'un message, sans rien gagner en lisibilité.
 */
function threadWidth(mergedCount: number) {
  if (mergedCount === 0) return "max-w-3xl";
  if (mergedCount === 1) return "max-w-5xl";
  return "max-w-7xl";
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // La garde d'affichage AVANT les chargements, et non dans le même
  // `Promise.all` : les actions portent la même permission et lèveraient au
  // même instant. `Promise.all` rejette sur le premier arrivé — l'agent
  // tomberait tantôt sur une redirection propre, tantôt sur une page d'erreur.
  const session = await requirePageAccess("tickets.view");

  const [
    ticket,
    statuses,
    priorities,
    categories,
    agents,
    customFields,
    sendDelaySeconds,
    aiEnabled,
  ] = await Promise.all([
    getTicketById(id),
    getTicketStatuses(),
    getTicketPriorities(),
    getTicketCategories(),
    getAgents(),
    getCustomFields(),
    // Combien de temps une réponse reste rattrapable après le clic (voir
    // Paramètres > Général).
    readReplySendDelaySeconds(),
    // Uniquement de quoi savoir si l'assistant a une chance de répondre : le
    // reste de la configuration (la clé en tête) ne quitte pas le serveur.
    getAiConfig().then((config) => Boolean(config.apiKey)),
  ]);

  if (!ticket) {
    notFound();
  }

  // Le dossier : le ticket où la demande se traite réellement. Arriver par un
  // doublon ne doit pas donner une vue au rabais — c'est le même dossier, vu par
  // une autre porte. Sans cette résolution, l'agent qui ouvre le ticket rattaché
  // ne voyait que sa moitié de conversation et pouvait répondre à un seul des
  // deux clients sans s'en rendre compte.
  let dossier = ticket;
  if (ticket.mergedIntoId) {
    const root = await getTicketById(await resolveMergeRoot(ticket.id));
    if (root) {
      dossier = root;
    }
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
  const canRespond = can(session.user.permissions, "tickets.respond");

  // Réponses type qui concernent ce dossier (voir /settings/canned-responses).
  // Les critères sont lus sur le dossier et non sur la porte d'entrée, comme
  // tout le reste de la zone de rédaction. Inutile de les charger pour un compte
  // en lecture seule : il n'a pas de champ où les insérer.
  let cannedResponses: TicketCannedResponses = { available: [], autoInserted: null };
  if (canRespond) {
    cannedResponses = await listCannedResponsesForTicket(
      {
        categoryId: dossier.categoryId,
        formSourceId: dossier.formSourceId,
        priorityId: dossier.priorityId,
        statusId: dossier.statusId,
      },
      {
        client: dossier.client?.name ?? null,
        agent: session?.user?.name ?? null,
        ticket: `#${dossier.number}`,
        produit: dossier.category?.name ?? null,
      },
    );
  }

  // À qui proposer une fusion, et quand. Un ticket déjà fusionné a sa place
  // arrêtée, et un ticket clos n'a plus de demande à rapprocher : dans les deux
  // cas la recherche ne servirait qu'à dépenser un appel au fournisseur d'IA.
  // La fusion a sa propre permission : répondre n'est pas rapprocher deux dossiers.
  const canMerge = can(session.user.permissions, "tickets.merge");
  let showDuplicates = canMerge;
  if (ticket.mergedIntoId) showDuplicates = false;
  if (ticket.status.isClosed) showDuplicates = false;

  // Rapprochements déjà calculés lors d'un passage précédent : rendus avec la
  // page, sans attendre. La bannière relance elle-même une détection à
  // l'ouverture, mais ne bloque pas l'affichage pour autant (voir
  // `DuplicateBanner`).
  let duplicateSuggestions: Awaited<ReturnType<typeof getPendingDuplicateSuggestions>> = [];
  if (showDuplicates) {
    duplicateSuggestions = await getPendingDuplicateSuggestions(ticket.id);
  }

  // Toutes les personnes du dossier : le panneau de droite les liste, et la zone
  // de réponse annonce combien d'emails partiront réellement.
  const dossierClients = listDossierClients(dossier);
  const mergedRecipientCount = countMergedRecipients(dossierClients);

  return (
    <div className="flex h-full">
      {/* Le témoin d'activité vit sur le dossier : une relance arrivée sur un
          doublon allume le ticket d'accueil (voir la synchro Gmail), c'est donc
          lui qu'il faut éteindre — quelle que soit la porte par laquelle l'agent
          est entré pour la lire. */}
      <MarkAsRead ticketId={dossier.id} hasUnreadActivity={dossier.hasUnreadActivity} />

      {/* La trace d'audit porte sur le ticket réellement ouvert, et non sur le
          dossier comme le témoin d'activité ci-dessus : le journal doit dire ce
          que l'agent a fait — « il a ouvert #128 » — sans réécrire son geste en
          « il a ouvert le dossier de #128 ». Sur un ticket non fusionné, les deux
          sont le même. */}
      <LogTicketView ticketId={ticket.id} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TicketHeader
          ticket={ticket}
          currentAgentId={session?.user?.id ?? null}
          canRespond={canRespond}
          canMerge={canMerge}
        />

        {/* Les deux bandeaux de fusion, avant le fil : ils disent où se traite
            réellement la demande, ce qui conditionne la lecture de tout le
            reste. Ils s'excluent — un ticket fusionné ailleurs n'a plus de
            doublon à chercher. */}
        {ticket.mergedInto && (
          <MergedIntoBanner
            mergedInto={ticket.mergedInto}
            ticketId={ticket.id}
            canMerge={canMerge}
          />
        )}

        {showDuplicates && (
          <DuplicateBanner
            ticketId={ticket.id}
            ticketNumber={ticket.number}
            initialSuggestions={duplicateSuggestions}
          />
        )}

        {/* Le fil s'élargit dès qu'il porte des conversations parallèles : deux
            colonnes tenues dans la largeur d'une seule ne se lisent pas. */}
        <div className={cn("mx-auto w-full px-6 py-6", threadWidth(dossier.mergedTickets.length))}>
          {/* Le fil est celui du dossier, jamais celui de la seule porte
              d'entrée : c'est ce qui fait qu'un doublon et son ticket d'accueil
              montrent exactement la même conversation.

              La zone de rédaction lui est confiée plutôt que posée à côté : elle
              se range sous le dernier message, et lui seul sait lequel c'est.
              Elle écrit sur le dossier, pas sur la porte d'entrée — répondre
              depuis un doublon doit servir tout le monde, sinon la fusion
              n'aurait tenu qu'à l'endroit d'où l'agent a cliqué. */}
          <TicketThread
            ticket={dossier}
            currentTicketId={ticket.id}
            canApprove={can(session.user.permissions, "approvals.handle")}
            canMerge={canMerge}
            agents={mentionableAgents}
            currentAgentId={session?.user?.id ?? null}
            replyBox={
              /* La clé attache la zone de rédaction à SON dossier : passer d'un
                 ticket à l'autre remonte un champ neuf, au lieu de conserver
                 l'état du précédent. Indispensable depuis le pré-remplissage —
                 sans elle, le brouillon proposé pour un ticket pourrait survivre
                 à la navigation et se retrouver sous les yeux du mauvais client. */
              <ReplyBox
                key={dossier.id}
                ticketId={dossier.id}
                currentAgentId={session.user.id}
                currentAgentName={session?.user?.name || session?.user?.email || "Agent"}
                clientEmail={dossier.client?.email ?? null}
                mergedRecipientCount={mergedRecipientCount}
                canRespond={canRespond}
                requiresApproval={session.user.requiresApproval}
                signature={signatureHtml && <SignatureBlock html={signatureHtml} />}
                agents={mentionableAgents}
                cannedResponses={cannedResponses}
                sendDelaySeconds={sendDelaySeconds}
                aiEnabled={aiEnabled}
              />
            }
          />
        </div>
      </div>

      <AttributesPanel
        ticket={ticket}
        clients={dossierClients}
        statuses={statuses}
        priorities={priorities}
        categories={categories}
        agents={agents}
        customFields={activeCustomFields}
        sourceFields={sourceFields}
        canDelete={can(session.user.permissions, "tickets.delete")}
      />
    </div>
  );
}
