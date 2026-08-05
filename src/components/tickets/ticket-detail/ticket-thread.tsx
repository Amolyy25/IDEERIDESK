import { Merge } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TicketWithMessages } from "@/lib/actions/tickets";
import type { MentionableAgent } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { AuthorAvatar } from "@/components/tickets/ticket-detail/author-avatar";
import { AttachmentsList } from "@/components/tickets/ticket-detail/attachments-list";
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
 * Sans doublon fusionné : une seule colonne, la conversation avec un client.
 *
 * Avec doublons : chaque demande garde sa propre colonne — celle du ticket à
 * gauche, celle de chaque doublon à droite — jusqu'au moment de la fusion, où
 * les lignes de temps se rejoignent en une colonne unique. C'est la lecture
 * juste de ce qui s'est passé : deux personnes ont écrit séparément, sans se
 * connaître, puis l'équipe a répondu une fois pour les deux. Un fil unique
 * mélangeait leurs messages et laissait croire à une conversation à trois.
 */
export function TicketThread({
  ticket,
  canApprove,
  canMerge,
  agents,
  currentAgentId,
  currentTicketId,
}: {
  ticket: TicketWithMessages;
  canApprove: boolean;
  /** Permission « tickets.merge » : conditionne le bouton « Séparer » d'une branche. */
  canMerge: boolean;
  agents: MentionableAgent[];
  currentAgentId: string | null;
  /**
   * Ticket dont l'agent a ouvert l'adresse. Différent de `ticket` quand il est
   * arrivé par un doublon : le fil affiché est alors celui du dossier entier, et
   * cette colonne-là est signalée pour qu'il sache où il se trouve.
   */
  currentTicketId?: string;
}) {
  const merged = ticket.mergedTickets;

  if (merged.length === 0) {
    return (
      <Timeline>
        <InitialRequest ticket={ticket} />
        <MessageThread
          messages={ticket.messages}
          canApprove={canApprove}
          agents={agents}
          currentAgentId={currentAgentId}
        />
      </Timeline>
    );
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

  afterMerge.sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
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
          header={
            <OwnBranchHeader ticket={ticket} isCurrent={currentTicketId === ticket.id} />
          }
        >
          <InitialRequest ticket={ticket} />
          <MessageThread
            messages={beforeMerge}
            canApprove={canApprove}
            agents={agents}
            currentAgentId={currentAgentId}
          />
        </BranchColumn>

        {merged.map((duplicate) => (
          <BranchColumn
            key={duplicate.id}
            align="right"
            header={
              <DuplicateBranchHeader
                duplicate={duplicate}
                canMerge={canMerge}
                isCurrent={currentTicketId === duplicate.id}
              />
            }
          >
            <DuplicateInitialRequest duplicate={duplicate} />
            {duplicate.messages
              .filter((message) => message.createdAt.getTime() < mergedAtOf(duplicate).getTime())
              .map((message) => (
                <DuplicateMessage
                  key={message.id}
                  message={message}
                  clientName={duplicate.client?.name ?? null}
                  align="right"
                />
              ))}
          </BranchColumn>
        ))}
      </div>

      <ConfluenceBand branchCount={merged.length} />

      {/* La colonne commune. Son rail démarre en haut, sans le retrait habituel,
          pour prolonger sans rupture le trait qui descend du raccord. */}
      <Timeline className="before:top-0">
        {afterMerge.map((entry) => {
          if (entry.kind === "own") {
            return (
              <MessageTimelineItem
                key={entry.message.id}
                message={entry.message}
                canApprove={canApprove}
                agents={agents}
                currentAgentId={currentAgentId}
              />
            );
          }

          return (
            <DuplicateMessage
              key={`${entry.duplicate.id}-${entry.message.id}`}
              message={entry.message}
              clientName={entry.duplicate.client?.name ?? null}
              origin={entry.duplicate.number}
            />
          );
        })}
      </Timeline>
    </div>
  );
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

/** Une conversation, de son ouverture jusqu'à la fusion. */
function BranchColumn({
  align,
  header,
  children,
}: {
  align: TimelineAlign;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {header}
      {/* `before:bottom-0` : le rail descend jusqu'au bas de la colonne pour
          rejoindre le raccord, au lieu de s'arrêter au dernier message. */}
      <Timeline align={align} className="mt-2 before:bottom-0">
        {children}
      </Timeline>
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
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
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
 * Le raccord : chaque branche de droite descend puis vire vers le rail de
 * gauche, qui poursuit seul en dessous.
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

      {Array.from({ length: branchCount }, (_, index) => (
        <span
          key={index}
          style={{ right: railOffsetFromRight(index + 1, columns) }}
          className="absolute top-0 bottom-0 left-4 rounded-br-xl border-r border-b border-border"
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
