"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendTicketReplyEmail, sendTicketClosureEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import {
  requireAdmin,
  requireApprovedAgent,
  requireCanApprove,
  requireCanRespond,
} from "@/lib/require-permission";
import type { EmailHistoryEntry } from "@/lib/email-template";
import { notifyMentionedAgents } from "@/lib/mention-notifications";
import { notifyTicketAssigned } from "@/lib/assignment-notifications";
import { resolveSignatureHtmlForAgent } from "@/lib/signature-store";
import { UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import { getMergedRecipients } from "@/lib/ticket-merge";

const ticketInclude = {
  status: true,
  priority: true,
  category: true,
  assignee: true,
  client: true,
} satisfies Prisma.TicketInclude;

export type TicketListItem = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

// Détail d'un ticket : `data` (le contenu binaire) est systématiquement écarté —
// une fiche avec quelques pièces jointes ferait sinon transiter plusieurs Mo par
// rendu, alors que le téléchargement passe par /api/attachments/[id].
const ticketDetailInclude = {
  ...ticketInclude,
  messages: {
    include: {
      agent: true,
      attachments: { omit: { data: true } },
    },
  },
  attachments: { omit: { data: true } },

  // Fusion : le ticket dans lequel celui-ci a été versé, et les doublons qu'il a
  // lui-même absorbés. Les seconds sont chargés avec leur demande, leurs
  // échanges publics ET leurs pièces jointes — c'est ce qui permet de tout
  // traiter depuis cette seule fiche, sans naviguer d'un ticket à l'autre. Une
  // capture d'écran envoyée par le second client est souvent la pièce qui manque
  // au premier ticket pour comprendre la panne : l'oublier ici viderait la
  // fusion d'une partie de son intérêt.
  //
  // Les notes internes des doublons restent chez eux : les remonter mélangerait
  // deux dossiers de travail.
  mergedInto: { select: { id: true, number: true, subject: true } },
  mergedTickets: {
    select: {
      id: true,
      number: true,
      subject: true,
      description: true,
      createdAt: true,
      mergedAt: true,
      client: { select: { name: true, email: true } },
      messages: {
        where: { isPrivate: false },
        select: {
          id: true,
          content: true,
          authorType: true,
          emailSent: true,
          createdAt: true,
          agent: { select: { name: true, avatarUrl: true } },
          attachments: { omit: { data: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
      // Comme sur la fiche principale : seules les pièces de la demande
      // initiale, celles des réponses étant déjà rattachées à leur message.
      attachments: {
        omit: { data: true },
        where: { messageId: null },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { mergedAt: "asc" },
  },
} satisfies Prisma.TicketInclude;

export type TicketWithMessages = Prisma.TicketGetPayload<{
  include: typeof ticketDetailInclude;
}>;

/** Pièce jointe telle qu'affichée dans la fiche ticket, sans son contenu binaire. */
export type TicketAttachment = TicketWithMessages["attachments"][number];

export type TicketListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  statusId?: string;
  priorityId?: string;
  categoryId?: string;
  /** Identifiant d'agent, ou `UNASSIGNED_FILTER` pour les tickets sans assigné. */
  assigneeId?: string;
  sortBy?: "number" | "subject" | "createdAt" | "updatedAt";
  sortDir?: "asc" | "desc";
  /** Filtre auto (produits couverts par les groupes de l'agent) — ignoré si `categoryId` est aussi fourni (un filtre manuel prime toujours). */
  categoryIds?: string[];
};

export async function getUnreadTicketCount() {
  await requireApprovedAgent();
  return prisma.ticket.count({ where: { hasUnreadActivity: true } });
}

/** Compteurs de la bande de vues, en haut de la liste de tickets. */
export type TicketQueueStats = {
  /** Tickets dont le statut n'est pas un statut de clôture. */
  open: number;
  unassigned: number;
  mine: number;
  unread: number;
};

/**
 * Les quelques nombres qu'un agent regarde avant de choisir sur quoi travailler.
 *
 * Même périmètre que la liste affichée en dessous (`categoryIds` = produits
 * couverts par ses groupes) : deux périmètres différents donneraient une bande
 * qui annonce 12 tickets au-dessus d'une liste qui en montre 4.
 */
export async function getTicketQueueStats({
  agentId,
  categoryIds = [],
}: {
  agentId: string | null;
  categoryIds?: string[];
}): Promise<TicketQueueStats> {
  await requireApprovedAgent();

  const scope: Prisma.TicketWhereInput = { status: { isClosed: false } };
  if (categoryIds.length > 0) {
    scope.categoryId = { in: categoryIds };
  }

  const [open, unassigned, unread] = await Promise.all([
    prisma.ticket.count({ where: scope }),
    prisma.ticket.count({ where: { ...scope, assigneeId: null } }),
    prisma.ticket.count({ where: { ...scope, hasUnreadActivity: true } }),
  ]);

  let mine = 0;
  if (agentId) {
    mine = await prisma.ticket.count({ where: { ...scope, assigneeId: agentId } });
  }

  return { open, unassigned, mine, unread };
}

export async function getTickets(filters: TicketListFilters = {}) {
  await requireApprovedAgent();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir ?? "desc";

  const search = filters.search?.trim();
  // « 128 » comme « #128 » : le numéro affiché partout dans l'application et
  // repris dans l'objet des emails est la première chose qu'un agent tape, et
  // c'était justement le seul terme qui ne trouvait rien.
  const searchedNumber = search ? Number(search.replace(/^#/, "")) : Number.NaN;
  const numberMatch: Prisma.TicketWhereInput[] =
    Number.isInteger(searchedNumber) && searchedNumber > 0 ? [{ number: searchedNumber }] : [];

  const where: Prisma.TicketWhereInput = {
    statusId: filters.statusId || undefined,
    priorityId: filters.priorityId || undefined,
    categoryId: filters.categoryId || undefined,
    // `null` (et non `undefined`) pour « non assigné » : c'est une condition à
    // part entière, pas l'absence de filtre.
    assigneeId:
      filters.assigneeId === UNASSIGNED_FILTER ? null : filters.assigneeId || undefined,
    ...(!filters.categoryId && filters.categoryIds?.length
      ? { categoryId: { in: filters.categoryIds } }
      : {}),
    ...(search
      ? {
          OR: [
            ...numberMatch,
            { subject: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            // Le corps du fil : une information donnée en cours de conversation
            // (référence de dossier, message d'erreur) n'est nulle part dans le
            // sujet ni dans la demande initiale.
            { messages: { some: { content: { contains: search, mode: "insensitive" } } } },
            {
              client: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getTicketById(id: string) {
  await requireApprovedAgent();
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      ...ticketDetailInclude,
      messages: {
        ...ticketDetailInclude.messages,
        include: {
          ...ticketDetailInclude.messages.include,
          attachments: {
            ...ticketDetailInclude.messages.include.attachments,
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      attachments: {
        ...ticketDetailInclude.attachments,
        // Seules les pièces jointes de la demande initiale : celles arrivées
        // dans une réponse s'affichent sous leur message, les lister deux fois
        // laisserait croire à des doublons.
        where: { messageId: null },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function markTicketAsRead(id: string) {
  await requireApprovedAgent();
  await prisma.ticket.updateMany({
    where: { id, hasUnreadActivity: true },
    data: { hasUnreadActivity: false },
  });
  revalidatePath("/tickets");
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(1, "Sujet requis").max(200),
  description: z.string().trim().min(1, "Description requise"),
  clientId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  statusId: z.string().min(1),
  priorityId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function createTicket(input: z.infer<typeof createTicketSchema>) {
  await requireCanRespond();
  const data = createTicketSchema.parse(input);
  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      description: data.description,
      clientId: data.clientId || null,
      categoryId: data.categoryId || null,
      statusId: data.statusId,
      priorityId: data.priorityId,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
  revalidatePath("/tickets");
  return ticket;
}

const updateTicketAttributesSchema = z.object({
  statusId: z.string().optional(),
  priorityId: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function updateTicketAttributes(
  id: string,
  input: z.infer<typeof updateTicketAttributesSchema>
) {
  const session = await requireCanRespond();
  const data = updateTicketAttributesSchema.parse(input);

  let closedAt: Date | null | undefined = undefined;
  if (data.statusId) {
    const status = await prisma.ticketStatus.findUnique({ where: { id: data.statusId } });
    closedAt = status?.isClosed ? new Date() : null;
  }

  // Assignation relue avant l'écriture : sans elle, impossible de distinguer
  // « ce ticket vient de changer de main » d'un simple renvoi de la même valeur
  // par le panneau d'attributs — et l'agent recevrait une notification à chaque
  // modification de priorité.
  const nextAssigneeId = data.assigneeId === undefined ? undefined : data.assigneeId || null;
  const previous =
    nextAssigneeId === undefined
      ? null
      : await prisma.ticket.findUnique({ where: { id }, select: { assigneeId: true } });

  await prisma.ticket.update({
    where: { id },
    data: {
      statusId: data.statusId,
      priorityId: data.priorityId,
      categoryId: data.categoryId === undefined ? undefined : data.categoryId || null,
      assigneeId: nextAssigneeId,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      closedAt,
    },
  });

  if (nextAssigneeId && previous && nextAssigneeId !== previous.assigneeId) {
    await notifyTicketAssigned({
      ticketId: id,
      assigneeId: nextAssigneeId,
      actorId: session.user.id,
    });
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function claimTicket(id: string) {
  // Garde partagée plutôt qu'un contrôle réécrit sur place : un contrôle
  // dupliqué à la main est un contrôle qu'on oublie de mettre à jour.
  const session = await requireCanRespond();
  const agentId = session.user.id;

  // Statut cible optionnel (configuré depuis /settings/statuses) — si aucun
  // n'est marqué, seule l'assignation change, sans erreur.
  const inProgressStatus = await prisma.ticketStatus.findFirst({
    where: { isInProgressDefault: true },
  });

  await prisma.ticket.update({
    where: { id },
    data: {
      assigneeId: agentId,
      ...(inProgressStatus ? { statusId: inProgressStatus.id } : {}),
    },
  });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function closeTicket(id: string) {
  await requireCanRespond();

  const closeStatus = await prisma.ticketStatus.findFirst({ where: { isCloseDefault: true } });
  if (!closeStatus) {
    throw new Error(
      "Aucun statut de clôture configuré. Choisissez-en un dans Paramètres > Statuts de ticket."
    );
  }

  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { client: true } });
  if (!ticket) {
    throw new Error("Ticket introuvable.");
  }

  await prisma.ticket.update({
    where: { id },
    data: { statusId: closeStatus.id, closedAt: new Date() },
  });

  // L'email de clôture est optionnel : sans modèle configuré, le ticket se
  // ferme silencieusement (comportement demandé — pas de spam si l'équipe n'a
  // pas encore rédigé de message de clôture).
  const template = await prisma.ticketClosureTemplate.findFirst();
  let emailSent = false;
  let emailSkippedReason: string | null = null;
  let alsoSentTo = 0;

  if (template?.bodyHtml) {
    const { senderName } = await readEmailAccountStatus();

    if (ticket.client?.email) {
      const result = await sendTicketClosureEmail({
        ticket,
        clientEmail: ticket.client.email,
        senderName,
        bodyHtml: template.bodyHtml,
      });
      emailSent = result.sent;
      emailSkippedReason = result.sent ? null : result.error ?? null;

      await prisma.message.create({
        data: {
          ticketId: id,
          content: result.sent
            ? "Email de clôture envoyé au client."
            : `Échec de l'envoi de l'email de clôture : ${result.error ?? "erreur inconnue"}.`,
          authorType: "SYSTEM",
          isPrivate: true,
        },
      });
    }

    // Les clients des tickets fusionnés attendent la même réponse : les laisser
    // sans email de clôture, c'est refermer leur demande sans le leur dire.
    // Chacun dans sa propre conversation, comme pour une réponse.
    for (const recipient of await getMergedRecipients(
      id,
      ticket.client?.email ? [ticket.client.email] : []
    )) {
      const result = await sendTicketClosureEmail({
        ticket: {
          id: recipient.ticketId,
          number: recipient.ticketNumber,
          subject: recipient.subject,
          gmailThreadId: recipient.gmailThreadId,
          emailMessageId: recipient.emailMessageId,
        },
        clientEmail: recipient.clientEmail,
        senderName,
        bodyHtml: template.bodyHtml,
      });
      if (result.sent) alsoSentTo += 1;

      await prisma.message.create({
        data: {
          ticketId: recipient.ticketId,
          content: result.sent
            ? `Email de clôture envoyé au client, suite à la clôture du ticket #${ticket.number}.`
            : `Échec de l'envoi de l'email de clôture : ${result.error ?? "erreur inconnue"}.`,
          authorType: "SYSTEM",
          isPrivate: true,
        },
      });
      revalidatePath(`/tickets/${recipient.ticketId}`);
    }
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { emailSent, emailSkippedReason, alsoSentTo };
}

export async function deleteTicket(id: string) {
  // Suppression définitive et non réversible d'un dossier client : réservée aux
  // admins, pas à tout agent capable de répondre.
  await requireAdmin();
  // Messages et pièces jointes suivent en cascade (onDelete: Cascade côté
  // schéma) — pas de nettoyage manuel à faire ici.
  await prisma.ticket.delete({ where: { id } });
  revalidatePath("/tickets");
}

const addMessageSchema = z.object({
  content: z.string().trim().min(1, "Message vide"),
  isPrivate: z.boolean().default(false),
});

const EMAIL_HISTORY_LIMIT = 10;

/**
 * Historique repris en bas de l'email, propre au ticket concerné.
 *
 * Toutes les réponses agent partent au nom façade unique "Ideeri Support" (une
 * seule boîte partagée pour toute l'équipe) — l'historique reprend cette même
 * convention plutôt que de révéler quel agent a écrit quoi.
 */
async function buildEmailHistory({
  ticketId,
  excludeMessageId,
  clientName,
  senderName,
}: {
  ticketId: string;
  excludeMessageId: string | null;
  clientName: string | null;
  senderName: string;
}): Promise<EmailHistoryEntry[]> {
  const previousMessages = await prisma.message.findMany({
    where: {
      ticketId,
      isPrivate: false,
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: EMAIL_HISTORY_LIMIT,
  });

  return previousMessages
    .map((m) => ({
      authorLabel: m.authorType === "AGENT" ? senderName : clientName ?? "Client",
      content: m.content,
      createdAt: m.createdAt,
    }))
    .reverse();
}

/**
 * Builds and actually sends the client-facing email for a public reply, then
 * marks the message as sent. Shared by the direct-send path (no approval
 * required) and `approveMessage` (an approver releasing a held reply) so the
 * send logic — including the conversation history — lives in one place.
 *
 * `agentId` est l'auteur de la réponse, pas l'expéditeur : c'est lui qui décide
 * de la signature ajoutée en bas de l'email. Une réponse relâchée par un
 * collègue habilité reste donc signée de celui qui l'a rédigée.
 *
 * Les tickets fusionnés dans celui-ci reçoivent la même réponse — c'est tout
 * l'intérêt de la fusion : écrire une fois pour tous ceux qui attendent. Voir
 * `deliverToMergedTickets` pour la façon dont ces envois sont séparés.
 */
async function sendApprovedTicketReply(
  ticketId: string,
  messageId: string,
  content: string,
  agentId: string | null
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { client: true } });
  if (!ticket) {
    return { emailSent: false as const, emailSkippedReason: "Ticket introuvable.", alsoSentTo: 0 };
  }

  const { senderName } = await readEmailAccountStatus();
  const signatureHtml = await resolveSignatureHtmlForAgent(agentId);

  let emailSent = false;
  let emailSkippedReason: string | null = "Aucun client associé à ce ticket.";

  if (ticket.client?.email) {
    const result = await sendTicketReplyEmail({
      ticket,
      clientEmail: ticket.client.email,
      senderName,
      bodyText: content,
      history: await buildEmailHistory({
        ticketId,
        excludeMessageId: messageId,
        clientName: ticket.client.name,
        senderName,
      }),
      signatureHtml,
    });

    emailSent = result.sent;
    emailSkippedReason = result.sent ? null : result.error ?? null;

    if (result.sent) {
      await prisma.message.update({
        where: { id: messageId },
        data: { emailSent: true, gmailMessageId: result.gmailMessageId },
      });
    }
  }

  const alsoSentTo = await deliverToMergedTickets({
    targetTicketId: ticketId,
    content,
    agentId,
    senderName,
    signatureHtml,
    alreadyServed: ticket.client?.email ? [ticket.client.email] : [],
  });

  revalidatePath(`/tickets/${ticketId}`);
  return { emailSent, emailSkippedReason, alsoSentTo };
}

/**
 * Rejoue la réponse auprès des clients des tickets fusionnés dans celui-ci.
 *
 * Un email par destinataire, dans sa propre conversation Gmail, jamais un Cc
 * commun : deux clients qui ont écrit séparément au support n'ont pas accepté
 * que leur adresse soit montrée à l'autre. C'est aussi ce qui garde chaque fil
 * lisible côté client — il reçoit une réponse à SON message, pas un message
 * groupé où il doit se reconnaître.
 *
 * Une copie de la réponse est déposée dans le fil de chaque ticket fusionné :
 * sans elle, le dossier de ce client montrerait une demande restée sans réponse.
 *
 * Best-effort et sans exception : un échec d'envoi sur un doublon ne doit pas
 * faire échouer la réponse principale, déjà partie. Il est journalisé dans le
 * fil du ticket concerné, là où un agent le verra.
 */
async function deliverToMergedTickets({
  targetTicketId,
  content,
  agentId,
  senderName,
  signatureHtml,
  alreadyServed,
}: {
  targetTicketId: string;
  content: string;
  agentId: string | null;
  senderName: string;
  signatureHtml: string | null;
  alreadyServed: string[];
}): Promise<number> {
  const recipients = await getMergedRecipients(targetTicketId, alreadyServed);
  let delivered = 0;

  for (const recipient of recipients) {
    const copy = await prisma.message.create({
      data: {
        ticketId: recipient.ticketId,
        content,
        authorType: "AGENT",
        agentId,
        isPrivate: false,
      },
    });

    const result = await sendTicketReplyEmail({
      ticket: {
        id: recipient.ticketId,
        number: recipient.ticketNumber,
        subject: recipient.subject,
        gmailThreadId: recipient.gmailThreadId,
        emailMessageId: recipient.emailMessageId,
      },
      clientEmail: recipient.clientEmail,
      senderName,
      bodyText: content,
      history: await buildEmailHistory({
        ticketId: recipient.ticketId,
        excludeMessageId: copy.id,
        clientName: recipient.clientName,
        senderName,
      }),
      signatureHtml,
    });

    if (result.sent) {
      delivered += 1;
      await prisma.message.update({
        where: { id: copy.id },
        data: { emailSent: true, gmailMessageId: result.gmailMessageId },
      });
    } else {
      await prisma.message.create({
        data: {
          ticketId: recipient.ticketId,
          content: `Échec de l'envoi de la réponse au client de ce ticket fusionné : ${
            result.error ?? "erreur inconnue"
          }.`,
          authorType: "SYSTEM",
          isPrivate: true,
        },
      });
    }
    revalidatePath(`/tickets/${recipient.ticketId}`);
  }

  return delivered;
}

export async function addTicketMessage(
  ticketId: string,
  input: z.infer<typeof addMessageSchema>
) {
  const data = addMessageSchema.parse(input);

  // L'auteur vient toujours de la session, jamais d'une valeur transmise par
  // le client : sinon un agent pourrait faire répondre un collègue à sa place.
  const session = await requireCanRespond();
  const agentId = session.user.id;

  const isPublicAgentReply = !data.isPrivate;
  const needsApproval = isPublicAgentReply && session.user.requiresApproval;

  const message = await prisma.message.create({
    data: {
      ticketId,
      content: data.content,
      authorType: "AGENT",
      agentId,
      isPrivate: data.isPrivate,
      approvalStatus: needsApproval ? "PENDING" : null,
    },
  });
  await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  if (!isPublicAgentReply) {
    // Les pings « @Prénom Nom » ne valent que pour une note interne : une
    // réponse publique part au client, y citer un collègue n'a pas de sens.
    const { mentionedNames } = await notifyMentionedAgents({
      ticketId,
      messageId: message.id,
      actorId: agentId,
      content: data.content,
    });
    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: false,
      mentionedNames,
    };
  }

  if (needsApproval) {
    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: true,
      mentionedNames: [] as string[],
    };
  }

  const sendResult = await sendApprovedTicketReply(ticketId, message.id, data.content, agentId);
  return { ...sendResult, pendingApproval: false, mentionedNames: [] as string[] };
}

const pendingApprovalSelect = {
  id: true,
  content: true,
  createdAt: true,
  agent: { select: { id: true, name: true } },
  ticket: {
    select: {
      id: true,
      number: true,
      subject: true,
      client: { select: { name: true } },
    },
  },
} satisfies Prisma.MessageSelect;

export type PendingApprovalMessage = Prisma.MessageGetPayload<{
  select: typeof pendingApprovalSelect;
}>;

/**
 * Réponses retenues en attente de validation, tous tickets confondus.
 *
 * Le workflow existait sans point d'entrée : un agent habilité devait tomber
 * par hasard sur le bon ticket pour découvrir qu'une réponse y attendait son
 * feu vert, pendant que le client, lui, n'avait rien reçu.
 *
 * Les plus anciennes d'abord : c'est l'ordre d'attente du client.
 */
export async function getPendingApprovalMessages() {
  await requireCanApprove();
  return prisma.message.findMany({
    where: { approvalStatus: "PENDING" },
    select: pendingApprovalSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingApprovalMessages() {
  await requireCanApprove();
  return prisma.message.count({ where: { approvalStatus: "PENDING" } });
}

export async function approveMessage(messageId: string) {
  const session = await requireCanApprove();

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }
  // Un agent portant à la fois `requiresApproval` et `canApprove` pourrait
  // sinon relâcher ses propres réponses, ce qui vide le workflow de son sens.
  if (message.agentId === session.user.id) {
    throw new Error("Un autre agent habilité doit valider votre propre réponse.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      approvalStatus: "APPROVED",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  const result = await sendApprovedTicketReply(
    message.ticketId,
    message.id,
    message.content,
    message.agentId
  );
  revalidatePath(`/tickets/${message.ticketId}`);
  return result;
}

export async function rejectMessage(messageId: string) {
  await requireCanApprove();

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { approvalStatus: "REJECTED" },
  });
  revalidatePath(`/tickets/${message.ticketId}`);
}
