"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/require-permission";
import { notifyMentionedAgents } from "@/lib/mention-notifications";
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
import { replySummary, resolveReplyBody, sendApprovedTicketReply } from "@/lib/ticket-reply";
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

/**
 * Journalise l'ouverture d'une fiche ticket (voir `LogTicketView`).
 *
 * Appelée depuis le client après montage, et non depuis la page : le préchargement
 * des `<Link>` de Next rend le composant serveur de la fiche sans qu'aucun agent
 * ne l'ait ouverte. Journaliser côté serveur inscrirait donc des consultations
 * fantômes — un journal d'audit qui affirme faux ne vaut rien. Même raisonnement
 * que `MarkAsRead`.
 *
 * Aucune valeur de retour, et aucune erreur remontée : la trace ne doit pas
 * perturber la lecture du ticket.
 */
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
      // Échéances SLA posées dans la création elle-même : un ticket n'existe
      // jamais, même une fraction de seconde, sans son horloge.
      ...(await slaDueDatesForNewTicket(data.priorityId)),
    },
  });

  await recordAudit({
    session,
    action: "TICKET_CREATED",
    ticket,
    summary: "Créé à la main depuis le back-office.",
  });

  // Les agents dont un groupe couvre ce produit, sauf celui qui vient de le
  // saisir : il n'a pas besoin qu'on lui annonce son propre geste.
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

  // Suspension ou reprise de l'horloge SLA, dans le MÊME `update` que le statut
  // qui la provoque : deux écritures séparées laisseraient une fenêtre pendant
  // laquelle le ticket est « en attente du client » avec une horloge qui tourne
  // encore. Vide quand le statut ne change pas de camp (le cas courant).
  const slaFields = data.statusId
    ? await slaFieldsForStatusChange({ ticketId: id, nextStatusId: data.statusId })
    : {};

  // Réouverture à la main : un ticket clos qu'on renvoie vers un statut ouvert
  // repart sur une horloge neuve, comme lorsqu'un client relance par email.
  // Après `slaFields` dans le `data` ci-dessous : les deux peuvent porter les
  // mêmes champs, et c'est la réouverture qui doit l'emporter.
  const reopenFields =
    data.statusId && closedAt === null
      ? await slaFieldsForReopen({ ticketId: id, priorityId: data.priorityId })
      : {};

  const nextAssigneeId = data.assigneeId === undefined ? undefined : data.assigneeId || null;

  // État complet relu avant l'écriture, pour trois usages :
  //
  // — l'assignation, sans quoi il est impossible de distinguer « ce ticket vient
  //   de changer de main » d'un simple renvoi de la même valeur par le panneau
  //   d'attributs (l'agent recevrait une notification à chaque changement de
  //   priorité) ;
  // — le délai SLA, qui n'est recalculé que si la priorité a réellement changé ;
  // — le journal d'audit, qui doit dire QUOI a changé : « Statut : Nouveau → En
  //   cours » et non « ticket modifié », seule forme réellement vérifiable.
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

  // Après l'écriture, pour que le recalcul lise bien la NOUVELLE priorité — et
  // seulement si elle a changé : l'engagement pris à l'arrivée du ticket ne se
  // réécrit pas parce qu'un agent a rouvert le panneau d'attributs.
  //
  // Jamais sur une réouverture : le recalcul repartirait de la date d'arrivée du
  // ticket et effacerait l'horloge neuve qu'on vient de lui donner.
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
    // Le panneau d'attributs renvoie l'ensemble des champs à chaque
    // enregistrement : sans ce test, la moitié du journal serait des lignes
    // « modifié » sans aucune modification.
    if (changes.length > 0) {
      await recordAudit({ session, action: "TICKET_UPDATED", ticket: after, changes });
    }
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function claimTicket(id: string) {
  // Garde partagée plutôt qu'un contrôle réécrit sur place : un contrôle
  // dupliqué à la main est un contrôle qu'on oublie de mettre à jour.
  const session = await requirePermission("tickets.respond");
  const agentId = session.user.id;

  // Statut cible optionnel (configuré depuis /settings/statuses) — si aucun
  // n'est marqué, seule l'assignation change, sans erreur.
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
  /**
   * Clôture SILENCIEUSE : le ticket se ferme sans qu'aucun email de clôture ne
   * parte, ni au client, ni aux clients des tickets fusionnés.
   *
   * Le cas qui la réclame est courant et n'avait pas de geste : un doublon
   * involontaire, un test de l'équipe, une demande réglée au téléphone une heure
   * plus tôt, un dossier ouvert par erreur par un formulaire public. Envoyer
   * « votre demande est résolue » à quelqu'un qui n'a rien demandé, ou qui a déjà
   * été servi de vive voix, ne l'informe pas : ça le rappelle à un échange dont
   * il n'attend plus rien.
   *
   * Le drapeau passe par le réseau comme le reste : il est donc validé, et non
   * lu tel quel.
   */
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
  // Suppression définitive et non réversible d'un dossier client : sa propre
  // permission, distincte de « répondre et modifier » — savoir traiter un
  // ticket n'est pas savoir en effacer un.
  const session = await requirePermission("tickets.delete");

  // Relu AVANT la suppression : c'est la seule occasion de figer le numéro et le
  // sujet dans le journal.
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: auditRefSelect });

  // Messages et pièces jointes suivent en cascade (onDelete: Cascade côté
  // schéma) — pas de nettoyage manuel à faire ici.
  await prisma.ticket.delete({ where: { id } });

  await recordAudit({
    session,
    action: "TICKET_DELETED",
    // `id: null` et non l'identifiant du ticket : il n'existe plus, et la clé
    // étrangère rejetterait la ligne — la trace de la suppression serait perdue
    // au moment précis où elle compte le plus. Numéro et sujet suffisent à
    // désigner le dossier disparu.
    ticket: ticket ? { id: null, number: ticket.number, subject: ticket.subject } : null,
    summary: "Suppression définitive du ticket et de tout son fil.",
  });

  revalidatePath("/tickets");
}

const addMessageSchema = z.object({
  content: z.string().trim().min(1, "Message vide"),
  /**
   * Mise en forme de la réponse, telle que produite par l'éditeur riche. Le
   * champ reste facultatif : une note interne s'écrit en texte, et l'appelant
   * peut être une version antérieure de la page restée ouverte dans un onglet.
   *
   * Assainie ci-dessous avant tout enregistrement, jamais stockée telle quelle :
   * une action exportée est un endpoint HTTP, ce paramètre n'est pas plus digne
   * de confiance que n'importe quel corps de requête.
   */
  contentHtml: z.string().optional(),
  isPrivate: z.boolean().default(false),
  /**
   * Note interne à laquelle celle-ci répond. Vérifiée ci-dessous contre le
   * ticket : un identifiant venu du client ne suffit pas à lier deux messages.
   */
  replyToId: z.string().optional(),
});

// Sans ce contrôle, l'identifiant transmis accrocherait une réponse à la note
// d'un autre dossier, dont l'extrait s'afficherait alors dans ce fil-ci.
async function resolveQuotedNote(ticketId: string, replyToId: string | undefined) {
  if (!replyToId) return null;

  const quoted = await prisma.message.findFirst({
    where: { id: replyToId, ticketId, isPrivate: true },
    select: { id: true },
  });
  if (!quoted) {
    throw new Error("La note à laquelle vous répondez n'existe plus.");
  }
  return quoted.id;
}

/**
 * Le premier agent qui répond à un ticket que personne n'a pris en devient
 * l'assigné.
 *
 * Répondre EST la prise en charge : jusqu'ici un ticket pouvait recevoir trois
 * réponses de trois agents en restant « non assigné », si bien que la file ne
 * distinguait plus les dossiers dont personne ne s'occupait de ceux qui étaient
 * déjà en cours de traitement — et deux agents pouvaient répondre en parallèle
 * au même client sans le savoir. Le bouton « Prendre en charge » reste utile
 * pour se réserver un dossier AVANT d'y répondre.
 *
 * `updateMany` et non `update`, et c'est tout l'intérêt de cette fonction : la
 * condition « personne n'est assigné » vit DANS la requête, donc dans l'UPDATE
 * lui-même. Deux agents qui répondent au même instant à un ticket libre
 * exécutent deux UPDATE dont un seul trouve encore `assigneeId` à NULL : le
 * premier arrivé garde le dossier. Un `findUnique` suivi d'un `update` donnerait
 * au contraire le ticket au DERNIER des deux, en écrasant silencieusement
 * l'assignation qu'il venait de lire comme nulle.
 *
 * Renvoie `true` seulement si c'est bien cet appel qui a pris le dossier — ce qui
 * conditionne la trace au journal et ce qu'on annonce à l'agent.
 */
async function claimOnFirstReply(ticketId: string, agentId: string): Promise<boolean> {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, assigneeId: null },
    data: { assigneeId: agentId },
  });
  return count > 0;
}

export async function addTicketMessage(
  ticketId: string,
  input: z.infer<typeof addMessageSchema>
) {
  const data = addMessageSchema.parse(input);

  // L'auteur vient toujours de la session, jamais d'une valeur transmise par
  // le client : sinon un agent pourrait faire répondre un collègue à sa place.
  const session = await requirePermission("tickets.respond");
  const agentId = session.user.id;

  const isPublicAgentReply = !data.isPrivate;
  const needsApproval = isPublicAgentReply && session.user.requiresApproval;

  // Une note interne reste du texte : ses mentions « @Prénom Nom » sont
  // repérées sur la chaîne brute, et elle ne part dans aucun email.
  const body = isPublicAgentReply ? resolveReplyBody(data) : { content: data.content, html: null };

  // Une réponse publique part au client : elle ne cite aucune note interne, même
  // si un onglet périmé transmet l'identifiant de celle qui l'a préparée.
  const replyToId = isPublicAgentReply ? null : await resolveQuotedNote(ticketId, data.replyToId);

  const message = await prisma.message.create({
    data: {
      ticketId,
      content: body.content,
      contentHtml: body.html,
      authorType: "AGENT",
      agentId,
      isPrivate: data.isPrivate,
      approvalStatus: needsApproval ? "PENDING" : null,
      replyToId,
    },
  });
  // Seules les réponses publiques prennent le dossier. Une note interne sert
  // souvent à faire l'inverse — « @Camille c'est pour toi » : s'attribuer le
  // ticket en la déposant contredirait le geste qu'on est en train de faire.
  //
  // Une réponse retenue en attente de validation le prend aussi : elle est
  // écrite, son auteur travaille bien ce dossier, et c'est lui qui devra le
  // reprendre si elle est refusée.
  const selfAssigned =
    isPublicAgentReply && agentId ? await claimOnFirstReply(ticketId, agentId) : false;

  const auditTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { updatedAt: new Date() },
    select: auditRefSelect,
  });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  // Avant la trace de la réponse : les deux gestes sont simultanés, mais le
  // journal se lit dans l'ordre où ils se sont produits — on prend le dossier,
  // puis on répond.
  if (selfAssigned) {
    await recordAudit({
      session,
      action: "TICKET_CLAIMED",
      ticket: auditTicket,
      summary: "Prise en charge automatique : premier agent à répondre à ce ticket non assigné.",
    });
  }

  if (!isPublicAgentReply) {
    // Les pings « @Prénom Nom » ne valent que pour une note interne : une
    // réponse publique part au client, y citer un collègue n'a pas de sens.
    const { mentionedNames } = await notifyMentionedAgents({
      ticketId,
      messageId: message.id,
      actorId: agentId,
      content: data.content,
    });

    // Le corps de la note n'est PAS journalisé : le journal dit qu'une note a été
    // ajoutée, le fil du ticket dit laquelle. Les agents mentionnés, eux, font
    // partie du « qui » — c'est ce qui explique pourquoi un collègue s'est mis à
    // travailler sur ce dossier.
    await recordAudit({
      session,
      action: "TICKET_NOTE_ADDED",
      ticket: auditTicket,
      summary:
        mentionedNames.length > 0
          ? `Note interne, avec mention de ${mentionedNames.join(", ")}.`
          : "Note interne, non visible du client.",
    });

    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: false,
      mentionedNames,
      // Toujours faux ici : une note interne ne prend pas le dossier.
      selfAssigned: false,
    };
  }

  if (needsApproval) {
    await recordAudit({
      session,
      action: "TICKET_REPLIED",
      ticket: auditTicket,
      summary: "Réponse rédigée, retenue en attente de validation — rien n'est parti au client.",
    });
    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: true,
      mentionedNames: [] as string[],
      selfAssigned,
    };
  }

  const sendResult = await sendApprovedTicketReply(
    ticketId,
    message.id,
    { content: message.content, html: message.contentHtml },
    agentId
  );

  await recordAudit({
    session,
    action: "TICKET_REPLIED",
    ticket: auditTicket,
    summary: replySummary(sendResult),
  });

  return { ...sendResult, pendingApproval: false, mentionedNames: [] as string[], selfAssigned };
}
