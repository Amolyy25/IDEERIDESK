"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/require-permission";
import { notifyTicketAssigned } from "@/lib/assignment-notifications";
import { breachedSlaWhere } from "@/lib/sla";
import {
  recomputeSlaAfterPriorityChange,
  slaDueDatesForNewTicket,
  slaFieldsForReopen,
  slaFieldsForStatusChange,
} from "@/lib/sla-store";
import { notifyQueueOnNewTicket } from "@/lib/queue-notifications";
import { announceClosure, closureSummary } from "@/lib/ticket-closure";
import {
  buildTicketListWhere,
  ticketDetailInclude,
  ticketInclude,
  type TicketListFilters,
} from "@/lib/ticket-query";
import {
  auditRefSelect,
  diffTicketSnapshots,
  readTicketSnapshot,
  recordAudit,
  recordTicketView,
} from "@/lib/audit";

// Les types vivent avec les `include` dont ils dérivent ; ré-exportés ici, qui
// reste la porte d'entrée du domaine côté composants.
export type {
  TicketListItem,
  TicketWithMessages,
  TicketAttachment,
  MergedTicket,
  MergedTicketMessage,
  TicketListFilters,
} from "@/lib/ticket-query";

export async function getUnreadTicketCount() {
  await requirePermission("tickets.view");
  return prisma.ticket.count({ where: { hasUnreadActivity: true } });
}

/** Compteurs de la bande de vues, en haut de la liste de tickets. */
export type TicketQueueStats = {
  /** Tickets dont le statut n'est pas un statut de clôture. */
  open: number;
  unassigned: number;
  mine: number;
  unread: number;
  /** Tickets dont un délai est dépassé, horloge en marche (voir `breachedSlaWhere`). */
  breached: number;
};

// Même périmètre que la liste affichée en dessous (`categoryIds` = produits des
// groupes de l'agent), sinon la bande annonce 12 tickets au-dessus d'une liste
// qui en montre 4.
export async function getTicketQueueStats({
  agentId,
  categoryIds = [],
}: {
  agentId: string | null;
  categoryIds?: string[];
}): Promise<TicketQueueStats> {
  await requirePermission("tickets.view");

  const scope: Prisma.TicketWhereInput = { status: { isClosed: false } };
  if (categoryIds.length > 0) {
    scope.categoryId = { in: categoryIds };
  }

  const [open, unassigned, unread, breached] = await Promise.all([
    prisma.ticket.count({ where: scope }),
    prisma.ticket.count({ where: { ...scope, assigneeId: null } }),
    prisma.ticket.count({ where: { ...scope, hasUnreadActivity: true } }),
    // `AND` et non un étalement : `breachedSlaWhere` porte son propre `OR`
    // (première réponse ou résolution), qu'une fusion à plat écraserait.
    prisma.ticket.count({ where: { ...scope, AND: [breachedSlaWhere()] } }),
  ]);

  let mine = 0;
  if (agentId) {
    mine = await prisma.ticket.count({ where: { ...scope, assigneeId: agentId } });
  }

  return { open, unassigned, mine, unread, breached };
}

export async function getTickets(filters: TicketListFilters = {}) {
  await requirePermission("tickets.view");
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir ?? "desc";

  const where = buildTicketListWhere(filters);

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
  await requirePermission("tickets.view");
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
  await requirePermission("tickets.view");
  await prisma.ticket.updateMany({
    where: { id, hasUnreadActivity: true },
    data: { hasUnreadActivity: false },
  });
  revalidatePath("/tickets");
}

// Appelée par le client après montage, jamais depuis la page : le préchargement
// des `<Link>` rend le composant serveur sans qu'aucun agent n'ait ouvert la
// fiche, ce qui inscrirait des consultations fantômes. Ne remonte aucune erreur,
// la trace ne doit pas gêner la lecture.
export async function logTicketConsultation(ticketId: string) {
  // Consulter est un geste de lecture : la garde est celle de la lecture.
  const session = await requirePermission("tickets.view");

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: auditRefSelect,
  });
  if (!ticket) return;

  await recordTicketView({ session, ticket });
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
  const session = await requirePermission("tickets.respond");
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
      // Dans la création elle-même : un ticket n'existe jamais sans son horloge.
      ...(await slaDueDatesForNewTicket(data.priorityId)),
    },
  });

  await recordAudit({
    session,
    action: "TICKET_CREATED",
    ticket,
    summary: "Créé à la main depuis le back-office.",
  });

  // Sauf l'agent qui vient de le saisir : pas d'annonce de son propre geste.
  await notifyQueueOnNewTicket({ ticketId: ticket.id, actorId: session.user.id });

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
  const session = await requirePermission("tickets.respond");
  const data = updateTicketAttributesSchema.parse(input);

  let closedAt: Date | null | undefined = undefined;
  if (data.statusId) {
    const status = await prisma.ticketStatus.findUnique({ where: { id: data.statusId } });
    closedAt = status?.isClosed ? new Date() : null;
  }

  // Dans le MÊME `update` que le statut qui la provoque : deux écritures
  // laisseraient une fenêtre « en attente du client » horloge tournante.
  const slaFields = data.statusId
    ? await slaFieldsForStatusChange({ ticketId: id, nextStatusId: data.statusId })
    : {};

  // Après `slaFields` dans le `data` : les deux portent les mêmes champs, et
  // c'est la réouverture qui doit l'emporter.
  const reopenFields =
    data.statusId && closedAt === null
      ? await slaFieldsForReopen({ ticketId: id, priorityId: data.priorityId })
      : {};

  const nextAssigneeId = data.assigneeId === undefined ? undefined : data.assigneeId || null;

  // Relu avant l'écriture, pour distinguer un vrai changement d'un renvoi à
  // l'identique par le panneau d'attributs : notification d'assignation, recalcul
  // SLA et différentiel du journal en dépendent tous les trois.
  const before = await readTicketSnapshot(id);

  await prisma.ticket.update({
    where: { id },
    data: {
      statusId: data.statusId,
      priorityId: data.priorityId,
      categoryId: data.categoryId === undefined ? undefined : data.categoryId || null,
      assigneeId: nextAssigneeId,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      closedAt,
      ...slaFields,
      ...reopenFields,
    },
  });

  // Après l'écriture, pour lire la NOUVELLE priorité. Jamais sur une réouverture :
  // le recalcul repartirait de la date d'arrivée et effacerait l'horloge neuve.
  const isReopening = Object.keys(reopenFields).length > 0;
  if (!isReopening && data.priorityId && before && data.priorityId !== before.priorityId) {
    await recomputeSlaAfterPriorityChange(id);
  }

  if (nextAssigneeId && before && nextAssigneeId !== before.assigneeId) {
    await notifyTicketAssigned({
      ticketId: id,
      assigneeId: nextAssigneeId,
      actorId: session.user.id,
    });
  }

  const after = before ? await readTicketSnapshot(id) : null;
  if (before && after) {
    const changes = diffTicketSnapshots(before, after);
    // Le panneau renvoie tous les champs à chaque enregistrement : sans ce test,
    // le journal se remplirait de « modifié » sans modification.
    if (changes.length > 0) {
      await recordAudit({ session, action: "TICKET_UPDATED", ticket: after, changes });
    }
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function claimTicket(id: string) {
  const session = await requirePermission("tickets.respond");
  const agentId = session.user.id;

  // Optionnel : sans statut marqué, seule l'assignation change, sans erreur.
  const inProgressStatus = await prisma.ticketStatus.findFirst({
    where: { isInProgressDefault: true },
  });

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      assigneeId: agentId,
      ...(inProgressStatus ? { statusId: inProgressStatus.id } : {}),
      // Prendre en charge fait aussi changer de statut : si l'équipe a marqué
      // celui-ci (ou celui qu'on quitte) comme suspendant l'horloge SLA, le
      // geste doit la suspendre ou la relancer comme n'importe quel autre
      // changement de statut.
      ...(inProgressStatus
        ? await slaFieldsForStatusChange({ ticketId: id, nextStatusId: inProgressStatus.id })
        : {}),
    },
    select: auditRefSelect,
  });

  await recordAudit({
    session,
    action: "TICKET_CLAIMED",
    ticket,
    summary: inProgressStatus
      ? `Assigné à lui-même, statut passé à « ${inProgressStatus.name} ».`
      : "Assigné à lui-même.",
  });

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

const closeTicketSchema = z.object({
  // Ferme sans aucun email, ni au client ni à ceux des tickets fusionnés :
  // doublon, test, demande déjà réglée au téléphone. Validé — vient du réseau.
  silent: z.boolean().optional(),
});

export async function closeTicket(id: string, options: z.infer<typeof closeTicketSchema> = {}) {
  const session = await requirePermission("tickets.respond");
  const { silent = false } = closeTicketSchema.parse(options);

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

  const outcome = await announceClosure(ticket, { silent });

  await recordAudit({
    session,
    action: "TICKET_CLOSED",
    ticket,
    summary: closureSummary({ ...outcome, statusName: closeStatus.name, silent }),
  });

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { ...outcome, silent };
}

export async function deleteTicket(id: string) {
  // Sa propre permission, distincte de « répondre et modifier » : savoir traiter
  // un ticket n'est pas savoir en effacer un.
  const session = await requirePermission("tickets.delete");

  // Relu AVANT la suppression : c'est la seule occasion de figer le numéro et le
  // sujet dans le journal.
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: auditRefSelect });

  // Messages et pièces jointes suivent en cascade (onDelete: Cascade au schéma).
  await prisma.ticket.delete({ where: { id } });

  await recordAudit({
    session,
    action: "TICKET_DELETED",
    // `id: null` : le ticket n'existe plus, la clé étrangère rejetterait la ligne
    // et la trace serait perdue au moment où elle compte le plus.
    ticket: ticket ? { id: null, number: ticket.number, subject: ticket.subject } : null,
    summary: "Suppression définitive du ticket et de tout son fil.",
  });

  revalidatePath("/tickets");
}
