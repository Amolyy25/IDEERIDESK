import { Merge } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TicketWithMessages } from "@/lib/actions/tickets";
import type { MentionableAgent } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
import { MessageBody } from "@/components/tickets/ticket-detail/message-body";
import { EmailOrigin } from "@/components/tickets/ticket-detail/email-origin";
import {
  Timeline,
  TimelineItem,
  type TimelineAlign,
} from "@/components/tickets/ticket-detail/timeline-item";
import {
  MessageThread,
  MessageTimelineItem,
  type Message,
} from "@/components/tickets/ticket-detail/message-thread";
import { SeparateButton } from "@/components/tickets/ticket-detail/merged-tickets";

type MergedTicket = TicketWithMessages["mergedTickets"][number];
type MergedMessage = MergedTicket["messages"][number];

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
  canMerge,
  agents,
  currentAgentId,
  currentTicketId,
  replyBox,
}: {
  ticket: TicketWithMessages;
  canApprove: boolean;
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

  if (merged.length === 0) {
    const entries: ThreadEntry[] = newestFirst(ticket.messages).map((message) => ({
      isTurn: isConversationTurn(message),
      node: (
        <MessageTimelineItem
          key={message.id}
          message={message}
          canApprove={canApprove}
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
  | { kind: "fromDuplicate"; date: Date; message: MergedMessage; duplicate: MergedTicket };

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

/**
 * Une conversation, de son ouverture jusqu'à la fusion.
 *
 * Le repère de colonne est en pied et non en tête : dans un fil qui se lit à
 * rebours, une branche commence en bas. Le placer au-dessus l'aurait mis entre
 * le raccord et le premier message de la colonne, coupant le rail à l'endroit
 * précis où il doit se voir descendre d'une conversation vers l'autre.
 */
function BranchColumn({
  align,
  footer,
  children,
}: {
  align: TimelineAlign;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {/* `before:top-0` : le rail part du haut de la colonne pour prolonger le
          raccord, au lieu de commencer au premier message. */}
      <Timeline align={align} className="mb-2 before:top-0">
        {children}
      </Timeline>
      {footer}
    </div>
  );
}

function OwnBranchHeader({
  ticket,
  isCurrent,
}: {
  ticket: TicketWithMessages;
  isCurrent: boolean;
}) {
  return (
    <BranchHeader
      align="left"
      number={ticket.number}
      clientName={ticket.client?.name ?? null}
      fallbackLabel="Demande d'origine"
      isCurrent={isCurrent}
    />
  );
}

function DuplicateBranchHeader({
  duplicate,
  canMerge,
  isCurrent,
}: {
  duplicate: MergedTicket;
  canMerge: boolean;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {canMerge && <SeparateButton ticketId={duplicate.id} className="h-6 px-2 text-xs" />}
      {/* Inutile de proposer d'ouvrir la page où l'on se trouve déjà. */}
      {!isCurrent && (
        <Link
          href={`/tickets/${duplicate.id}`}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Ouvrir
        </Link>
      )}
      <BranchHeader
        align="right"
        number={duplicate.number}
        clientName={duplicate.client?.name ?? null}
        fallbackLabel="Doublon fusionné"
        isDuplicate
        isCurrent={isCurrent}
      />
    </div>
  );
}

/**
 * Qui parle dans cette colonne : sans ce repère, deux fils côte à côte se
 * confondent.
 *
 * `isCurrent` marque la colonne correspondant à l'adresse ouverte. C'est ce qui
 * permet d'arriver depuis un doublon sans se perdre : le dossier entier
 * s'affiche, et l'agent voit immédiatement par quelle porte il est entré.
 */
function BranchHeader({
  align,
  number,
  clientName,
  fallbackLabel,
  isDuplicate = false,
  isCurrent,
}: {
  align: TimelineAlign;
  number: number;
  clientName: string | null;
  fallbackLabel: string;
  isDuplicate?: boolean;
  isCurrent: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        align === "right" && "justify-end"
      )}
    >
      <Badge variant="outline" className="gap-1.5 text-[11px] font-normal">
        {isDuplicate && <Merge className="size-3" />}#{number}
      </Badge>
      <span className="truncate text-xs font-medium">{clientName ?? fallbackLabel}</span>
      {isCurrent && (
        <Badge variant="secondary" className="text-[11px] font-normal">
          Vous êtes ici
        </Badge>
      )}
    </div>
  );
}

/** La demande qui a ouvert le ticket : premier tour de la conversation, pas un encadré à part. */
function InitialRequest({ ticket }: { ticket: TicketWithMessages }) {
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

function DuplicateInitialRequest({ duplicate }: { duplicate: MergedTicket }) {
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

/**
 * Un message d'un doublon. Rendu à part des messages du ticket : ceux-là n'ont
 * ni note interne ni validation à afficher, et portent l'étiquette du ticket
 * dont ils viennent quand ils remontent dans la colonne commune.
 */
function DuplicateMessage({
  message,
  clientName,
  align = "left",
  origin,
}: {
  message: MergedMessage;
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

/** Gouttière horizontale de la grille des branches (`gap-x-6`), en rem. */
const BRANCH_GAP_REM = 1.5;

/** Écart entre le bord d'une colonne et son rail — la moitié d'une pastille (`left-4`). */
const RAIL_INSET_REM = 1;

/**
 * Le raccord : le rail unique de la colonne commune, en haut, se sépare en
 * autant de branches qu'il y a de conversations d'origine en dessous.
 *
 * Le tracé suit le sens de lecture du fil, à rebours du temps : la fusion se lit
 * donc de haut en bas comme une séparation. C'est le même événement vu par
 * l'autre bout, et le seul dessin qui ne fasse pas remonter un trait à
 * contresens du reste de la page.
 *
 * Tracé en bordures plutôt qu'en SVG : la position d'un rail dépend de la
 * largeur réelle des colonnes, que seul le navigateur connaît. Un `calc()` la
 * suit à chaque redimensionnement, là où un SVG à coordonnées fixes se
 * décalerait dès que le panneau latéral change de largeur.
 */
function ConfluenceBand({ branchCount }: { branchCount: number }) {
  const columns = branchCount + 1;

  return (
    <div aria-hidden className="relative hidden h-10 md:block">
      {/* Le rail du ticket, qui traverse sans dévier : c'est le dossier qui reste. */}
      <span className="absolute top-0 bottom-0 left-4 w-px bg-border" />

      {/* Bordures haute et droite : le trait quitte le rail de gauche à hauteur
          du dernier message commun, file vers la colonne de la branche, puis
          vire vers le bas pour y descendre. */}
      {Array.from({ length: branchCount }, (_, index) => (
        <span
          key={index}
          style={{ right: railOffsetFromRight(index + 1, columns) }}
          className="absolute top-0 bottom-0 left-4 rounded-tr-xl border-t border-r border-border"
        />
      ))}
    </div>
  );
}

/**
 * Distance entre le bord droit du fil et le rail de la colonne `columnIndex`.
 *
 * Les gouttières comptent : à trois colonnes, les ignorer décalait le raccord
 * d'un demi-`rem` et le trait arrivait à côté du rail qu'il devait rejoindre.
 * La largeur d'une colonne est donc reconstruite comme le fait la grille
 * elle-même — largeur totale moins les gouttières, divisée par le nombre de
 * colonnes.
 */
function railOffsetFromRight(columnIndex: number, columns: number) {
  const gapsTotal = `${(columns - 1) * BRANCH_GAP_REM}rem`;
  const columnWidth = `((100% - ${gapsTotal}) / ${columns})`;
  const rightEdge = `(${columnIndex + 1} * ${columnWidth} + ${columnIndex * BRANCH_GAP_REM}rem)`;

  return `calc(100% - ${rightEdge} + ${RAIL_INSET_REM}rem)`;
}
