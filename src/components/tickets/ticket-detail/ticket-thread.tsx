import type {
  MergedTicket,
  MergedTicketMessage,
  TicketWithMessages,
} from "@/lib/actions/tickets";
import type { MentionableAgent } from "@/lib/mentions";
import { resolveNoteQuotes } from "@/lib/note-replies";
import { Timeline } from "@/components/tickets/ticket-detail/timeline-item";
import {
  MessageThread,
  MessageTimelineItem,
  type Message,
} from "@/components/tickets/ticket-detail/message-thread";
import {
  BranchColumn,
  ConfluenceBand,
  DuplicateBranchHeader,
  OwnBranchHeader,
} from "@/components/tickets/ticket-detail/thread-branches";
import {
  DuplicateInitialRequest,
  InitialRequest,
} from "@/components/tickets/ticket-detail/thread-requests";
import { DuplicateMessage } from "@/components/tickets/ticket-detail/duplicate-message";

/**
 * Le fil du ticket, dans l'une de ses deux formes.
 *
 * LE FIL SE LIT DU PLUS RÉCENT AU PLUS ANCIEN : le dernier tour de la
 * conversation est en haut, la demande d'origine tout en bas. C'est ce qu'un
 * agent vient chercher en ouvrant un ticket — ce qui vient d'arriver, pas ce
 * qui s'est dit il y a trois semaines. Sur un dossier qui traîne, l'ordre
 * chronologique obligeait à dérouler toute l'histoire pour atteindre la seule
 * ligne encore d'actualité. Le temps descend donc à rebours, partout dans ce
 * fichier : les tableaux sont triés du plus récent au plus ancien, et chaque
 * bloc est rendu après ceux qui lui sont postérieurs.
 *
 * Sans doublon fusionné : une seule colonne, la conversation avec un client.
 *
 * Avec doublons : chaque demande garde sa propre colonne — celle du ticket à
 * gauche, celle de chaque doublon à droite — jusqu'au moment de la fusion, où
 * les lignes de temps se rejoignent en une colonne unique. C'est la lecture
 * juste de ce qui s'est passé : deux personnes ont écrit séparément, sans se
 * connaître, puis l'équipe a répondu une fois pour les deux. Un fil unique
 * mélangeait leurs messages et laissait croire à une conversation à trois.
 * L'inversion retourne ce dessin sans le défaire : la colonne commune occupe
 * le haut, et les branches, plus anciennes, s'ouvrent en dessous.
 */
export function TicketThread({
  ticket,
  canApprove,
  canReply,
  canMerge,
  agents,
  currentAgentId,
  currentTicketId,
  replyBox,
}: {
  ticket: TicketWithMessages;
  canApprove: boolean;
  /** Permission « tickets.respond » : conditionne le bouton « Répondre » d'une note. */
  canReply: boolean;
  /** Permission « tickets.merge » : conditionne le bouton « Séparer » d'une branche. */
  canMerge: boolean;
  agents: MentionableAgent[];
  currentAgentId: string | null;
  /**
   * Zone de rédaction, posée dans le fil et non au-dessus : on répond au dernier
   * message, elle a donc sa place juste sous lui. Le fil est seul à savoir
   * lequel est le dernier — d'autant qu'avec des doublons fusionnés, il ne se
   * trouve pas forcément dans la même colonne d'un ticket à l'autre.
   */
  replyBox: React.ReactNode;
  /**
   * Ticket dont l'agent a ouvert l'adresse. Différent de `ticket` quand il est
   * arrivé par un doublon : le fil affiché est alors celui du dossier entier, et
   * cette colonne-là est signalée pour qu'il sache où il se trouve.
   */
  currentTicketId?: string;
}) {
  const merged = ticket.mergedTickets;
  // Les notes citées, résolues une fois pour tout le fil : chaque carte y lit la
  // sienne au lieu de rechercher son message dans le tableau.
  const quotes = resolveNoteQuotes(ticket.messages);

  if (merged.length === 0) {
    const entries: ThreadEntry[] = newestFirst(ticket.messages).map((message) => ({
      isTurn: isConversationTurn(message),
      node: (
        <MessageTimelineItem
          key={message.id}
          message={message}
          canApprove={canApprove}
          canReply={canReply}
          quote={quotes.get(message.id)}
          agents={agents}
          currentAgentId={currentAgentId}
        />
      ),
    }));

    // La demande d'origine est un tour de parole, et le dernier qu'on puisse
    // atteindre : c'est elle que la zone de rédaction rejoint sur un ticket sans
    // réponse, comme sur un ticket dont toutes les réponses sont des notes.
    entries.push({
      isTurn: true,
      node: <InitialRequest key="initial-request" ticket={ticket} />,
    });

    return <Timeline>{withReplyBox(entries, replyBox)}</Timeline>;
  }

  // Point de confluence : la première fusion. Tout ce qui précède appartient
  // encore à des conversations séparées, tout ce qui suit est commun.
  const confluenceAt = Math.min(...merged.map((duplicate) => mergedAtOf(duplicate).getTime()));

  const beforeMerge: Message[] = [];
  const afterMerge: CentralEntry[] = [];
  for (const message of ticket.messages) {
    if (message.createdAt.getTime() < confluenceAt) {
      beforeMerge.push(message);
      continue;
    }
    afterMerge.push({ kind: "own", date: message.createdAt, message });
  }

  // Ce qu'un client de doublon a écrit APRÈS la fusion remonte dans la colonne
  // commune : c'est une relance qui attend une réponse, elle n'a rien à faire
  // dans une branche close. Les messages d'agent postérieurs, eux, sont les
  // copies déposées par l'envoi groupé — les afficher ferait voir deux fois la
  // même réponse.
  for (const duplicate of merged) {
    const mergedAt = mergedAtOf(duplicate).getTime();
    for (const message of duplicate.messages) {
      if (message.createdAt.getTime() < mergedAt) continue;
      if (message.authorType !== "CLIENT") continue;
      afterMerge.push({ kind: "fromDuplicate", date: message.createdAt, message, duplicate });
    }
  }

  afterMerge.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div>
      {/* La colonne commune, en tête puisqu'elle porte les derniers échanges.
          Son rail descend jusqu'en bas, sans le retrait habituel, pour rejoindre
          sans rupture le raccord d'où repartent les branches. */}
      <Timeline className="before:bottom-0">
        {withReplyBox(
          afterMerge.map((entry): ThreadEntry => {
            if (entry.kind === "own") {
              return {
                isTurn: isConversationTurn(entry.message),
                node: (
                  <MessageTimelineItem
                    key={entry.message.id}
                    message={entry.message}
                    canApprove={canApprove}
                    canReply={canReply}
                    quote={quotes.get(entry.message.id)}
                    agents={agents}
                    currentAgentId={currentAgentId}
                  />
                ),
              };
            }

            return {
              // Ce qui remonte d'un doublon est toujours une réponse de client :
              // les notes internes des branches ne sont même pas chargées (voir
              // `ticketDetailInclude`), et le filtre plus haut écarte le reste.
              isTurn: true,
              node: (
                <DuplicateMessage
                  key={`${entry.duplicate.id}-${entry.message.id}`}
                  message={entry.message}
                  clientName={entry.duplicate.client?.name ?? null}
                  origin={entry.duplicate.number}
                />
              ),
            };
          }),
          replyBox
        )}
      </Timeline>

      <ConfluenceBand branchCount={merged.length} />

      {/* Les branches. En dessous de `md` elles s'empilent : deux colonnes de
          200 px seraient illisibles. Le raccord disparaît alors avec elles — son
          tracé n'a de sens qu'en vis-à-vis. */}
      <div
        className="grid grid-cols-1 gap-x-6 gap-y-8 md:[grid-template-columns:var(--branch-columns)]"
        style={
          {
            "--branch-columns": `repeat(${merged.length + 1}, minmax(0, 1fr))`,
          } as React.CSSProperties
        }
      >
        <BranchColumn
          align="left"
          footer={
            <OwnBranchHeader ticket={ticket} isCurrent={currentTicketId === ticket.id} />
          }
        >
          <MessageThread
            messages={newestFirst(beforeMerge)}
            canApprove={canApprove}
            canReply={canReply}
            quotes={quotes}
            agents={agents}
            currentAgentId={currentAgentId}
          />
          <InitialRequest ticket={ticket} />
        </BranchColumn>

        {merged.map((duplicate) => (
          <BranchColumn
            key={duplicate.id}
            align="right"
            footer={
              <DuplicateBranchHeader
                duplicate={duplicate}
                canMerge={canMerge}
                isCurrent={currentTicketId === duplicate.id}
              />
            }
          >
            {newestFirst(
              duplicate.messages.filter(
                (message) => message.createdAt.getTime() < mergedAtOf(duplicate).getTime()
              )
            ).map((message) => (
              <DuplicateMessage
                key={message.id}
                message={message}
                clientName={duplicate.client?.name ?? null}
                align="right"
              />
            ))}
            <DuplicateInitialRequest duplicate={duplicate} />
          </BranchColumn>
        ))}
      </div>
    </div>
  );
}

/** Une entrée du fil, et ce qu'elle pèse dans la recherche du dernier message. */
type ThreadEntry = {
  node: React.ReactNode;
  /**
   * Un tour de parole, par opposition à une note interne ou à un événement de
   * service (accusé de réception, échec d'envoi). Seuls les tours de parole ont
   * un destinataire : ce sont eux auxquels on répond.
   */
  isTurn: boolean;
};

/** Ce message a-t-il été adressé à quelqu'un hors de l'équipe ? */
function isConversationTurn(message: Message) {
  return message.authorType !== "SYSTEM" && !message.isPrivate;
}

/**
 * Le fil, avec la zone de rédaction glissée sous le dernier tour de parole.
 *
 * Dans un fil qui se lit à rebours, le premier élément est le dernier message :
 * la zone de réponse se retrouve donc là où l'on répond, collée au message
 * auquel on répond, et tout l'historique la suit sans jamais la déplacer.
 *
 * Sauf que le premier élément n'est pas toujours ce à quoi on répond. Une note
 * interne posée après coup — « je l'ai eu au téléphone », « à voir avec la
 * compta » — est justement écrite POUR préparer la réponse : la glisser
 * au-dessus de la zone de rédaction cacherait sous l'historique le message du
 * client qu'elle commente. Tout ce qui n'est pas un tour de parole monte donc
 * en tête avec le dernier vrai message, et la zone de rédaction se place sous
 * l'ensemble : la note et ce qu'elle annote restent lisibles d'un seul regard,
 * au-dessus du champ où l'on écrit.
 *
 * Le cas d'une colonne vide est réel et non défensif : un ticket peut être
 * fusionné avant tout échange commun, et la zone de rédaction reste alors seule
 * au-dessus du raccord, prête à ouvrir la conversation du dossier.
 */
function withReplyBox(entries: ThreadEntry[], replyBox: React.ReactNode) {
  // Le point de coupe : après le premier tour de parole rencontré en
  // descendant. Sans aucun tour de parole — colonne vide, ou fil ne contenant
  // que des notes — la boucle sort au bout et la zone de rédaction ferme le fil.
  let cut = 0;
  while (cut < entries.length && !entries[cut].isTurn) cut++;
  if (cut < entries.length) cut++;

  const nodes = entries.map((entry) => entry.node);
  return [
    ...nodes.slice(0, cut),
    <ReplySlot key="reply-box">{replyBox}</ReplySlot>,
    ...nodes.slice(cut),
  ];
}

/**
 * L'emplacement de la zone de rédaction dans la ligne de temps.
 *
 * Un `<li>`, comme les messages : la ligne de temps est une liste ordonnée, un
 * `<div>` glissé entre deux entrées n'y aurait pas sa place. Le retrait
 * remplace la pastille d'auteur (sa largeur, plus l'écart) pour aligner le
 * champ sur les cartes ; la ligne de temps passe derrière, sans interruption —
 * la conversation n'est pas finie.
 */
function ReplySlot({ children }: { children: React.ReactNode }) {
  return <li className="relative pl-11">{children}</li>;
}

/**
 * Le fil, du plus récent au plus ancien.
 *
 * Trié, et non simplement retourné : l'ordre d'arrivée dépend de la requête qui
 * a chargé le ticket, et un `reverse()` aurait donné un fil correct tant que
 * cette requête ne changeait pas.
 */
function newestFirst<T extends { createdAt: Date }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Une entrée de la colonne commune : écrite ici, ou remontée d'un doublon. */
type CentralEntry =
  | { kind: "own"; date: Date; message: Message }
  | { kind: "fromDuplicate"; date: Date; message: MergedTicketMessage; duplicate: MergedTicket };

/**
 * Date de fusion, avec repli sur la création.
 *
 * `mergedAt` est posé par la fusion, mais peut manquer sur une donnée ancienne
 * ou réparée à la main : sans ce repli, la comparaison porterait sur `null` et
 * ferait basculer toute la branche du mauvais côté du raccord.
 */
function mergedAtOf(duplicate: MergedTicket): Date {
  if (duplicate.mergedAt) return duplicate.mergedAt;
  return duplicate.createdAt;
}
