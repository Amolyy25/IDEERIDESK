"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendTicketReplyEmail, sendTicketClosureEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import { requirePermission } from "@/lib/require-permission";
import type { EmailHistoryEntry } from "@/lib/email-template";
import { notifyMentionedAgents } from "@/lib/mention-notifications";
import { notifyTicketAssigned } from "@/lib/assignment-notifications";
import { resolveSignatureHtmlForAgent } from "@/lib/signature-store";
import { SLA_BREACHED_FILTER, UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import { breachedSlaWhere } from "@/lib/sla";
import {
  markSlaFirstResponse,
  recomputeSlaAfterPriorityChange,
  slaDueDatesForNewTicket,
  slaFieldsForReopen,
  slaFieldsForStatusChange,
} from "@/lib/sla-store";
import { getMergedRecipients } from "@/lib/ticket-merge";
import {
  diffTicketSnapshots,
  readTicketSnapshot,
  recordAudit,
  recordTicketView,
  type AuditTicketRef,
} from "@/lib/audit";

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
  /** `SLA_BREACHED_FILTER` pour ne garder que les tickets dont un délai est dépassé. */
  sla?: string;
  /** Filtre auto (produits couverts par les groupes de l'agent) — ignoré si `categoryId` est aussi fourni (un filtre manuel prime toujours). */
  categoryIds?: string[];
};

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
    // Dans `AND` : la condition « en retard » porte son propre `OR`, et la
    // recherche plein texte en pose un autre juste en dessous. Deux `OR` au même
    // niveau se remplaceraient l'un l'autre, et la vue montrerait alors des
    // tickets à l'heure.
    //
    // `status.isClosed` en plus de `closedAt` : les deux ne disent pas toujours
    // la même chose (une clôture par automatisation vers un statut fermé peut
    // n'avoir que le statut), et cette vue ne doit lister que ce sur quoi il
    // reste à agir.
    ...(filters.sla === SLA_BREACHED_FILTER
      ? { AND: [breachedSlaWhere(), { status: { isClosed: false } }] }
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

/** Référence figée dans le journal d'audit — numéro et sujet, rien de plus. */
function auditRefSelect() {
  return { id: true, number: true, subject: true } satisfies Prisma.TicketSelect;
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
    select: auditRefSelect(),
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
    select: auditRefSelect(),
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

  // L'email de clôture est optionnel : sans modèle configuré, le ticket se
  // ferme silencieusement (comportement demandé — pas de spam si l'équipe n'a
  // pas encore rédigé de message de clôture).
  const template = silent ? null : await prisma.ticketClosureTemplate.findFirst();
  let emailSent = false;
  let emailSkippedReason: string | null = null;
  let alsoSentTo = 0;

  if (silent) {
    // Note interne, et pas seulement une ligne au journal : c'est dans le fil que
    // le prochain agent cherchera pourquoi ce dossier est clos sans qu'aucune
    // réponse n'en soit partie. Sans elle, l'absence d'email se lit comme un
    // oubli, ou comme une panne d'envoi.
    await prisma.message.create({
      data: {
        ticketId: id,
        content:
          "Clôture silencieuse : le ticket a été fermé sans email de clôture, à la demande de l'agent. Le client n'a pas été prévenu.",
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });
  }

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

  await recordAudit({
    session,
    action: "TICKET_CLOSED",
    ticket,
    summary: [
      `Statut passé à « ${closeStatus.name} ».`,
      // Le fait le plus important à tracer d'une clôture silencieuse : que
      // PERSONNE n'a été prévenu, et que c'était voulu. C'est ce qui répond, des
      // mois plus tard, au client qui affirme n'avoir jamais eu de nouvelles.
      silent
        ? "Clôture silencieuse demandée par l'agent : aucun email envoyé, ni au client, ni aux clients des tickets fusionnés."
        : null,
      emailSent ? "Email de clôture envoyé au client." : null,
      emailSkippedReason ? `Email de clôture non envoyé : ${emailSkippedReason}` : null,
      alsoSentTo > 0
        ? `Clôture répercutée sur ${alsoSentTo} ticket${alsoSentTo > 1 ? "s" : ""} fusionné${
            alsoSentTo > 1 ? "s" : ""
          }.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  });

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { emailSent, emailSkippedReason, alsoSentTo, silent };
}

export async function deleteTicket(id: string) {
  // Suppression définitive et non réversible d'un dossier client : sa propre
  // permission, distincte de « répondre et modifier » — savoir traiter un
  // ticket n'est pas savoir en effacer un.
  const session = await requirePermission("tickets.delete");

  // Relu AVANT la suppression : c'est la seule occasion de figer le numéro et le
  // sujet dans le journal.
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: auditRefSelect() });

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

  // Arrêt de l'horloge de première réponse. Ici et pas à la création du message,
  // parce que c'est ici que passent les DEUX chemins d'une réponse publique :
  // l'envoi direct et le relâchement d'une réponse validée. Une réponse retenue
  // en attente de validation n'a rien adressé au client, l'horloge tourne
  // encore — c'est bien le point du workflow de validation.
  //
  // Indépendant du succès de l'envoi : l'agent a fait sa part. Un échec Gmail
  // est un incident technique, tracé comme tel dans le fil, et le compter comme
  // un manquement au délai brouillerait les deux sujets.
  await markSlaFirstResponse(ticketId);

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
    select: auditRefSelect(),
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

  const sendResult = await sendApprovedTicketReply(ticketId, message.id, data.content, agentId);

  await recordAudit({
    session,
    action: "TICKET_REPLIED",
    ticket: auditTicket,
    summary: replySummary(sendResult),
  });

  return { ...sendResult, pendingApproval: false, mentionedNames: [] as string[], selfAssigned };
}

/**
 * Ce que le journal retient d'une réponse partie : son sort, jamais son contenu.
 *
 * Un envoi qui a échoué est le fait le plus important à tracer — c'est celui qui
 * explique, des semaines plus tard, pourquoi un client dit n'avoir jamais eu de
 * réponse alors que le fil du ticket en montre une.
 */
function replySummary({
  emailSent,
  emailSkippedReason,
  alsoSentTo,
}: {
  emailSent: boolean;
  emailSkippedReason: string | null;
  alsoSentTo: number;
}) {
  const parts = [
    emailSent
      ? "Réponse publique envoyée au client par email."
      : `Réponse publique enregistrée, email non envoyé : ${
          emailSkippedReason ?? "raison inconnue"
        }`,
  ];
  if (alsoSentTo > 0) {
    parts.push(
      `Également envoyée aux clients de ${alsoSentTo} ticket${
        alsoSentTo > 1 ? "s" : ""
      } fusionné${alsoSentTo > 1 ? "s" : ""}.`,
    );
  }
  return parts.join(" ");
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
  await requirePermission("approvals.handle");
  return prisma.message.findMany({
    where: { approvalStatus: "PENDING" },
    select: pendingApprovalSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingApprovalMessages() {
  await requirePermission("approvals.handle");
  return prisma.message.count({ where: { approvalStatus: "PENDING" } });
}

export async function approveMessage(messageId: string) {
  const session = await requirePermission("approvals.handle");

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }
  // Un agent portant à la fois `requiresApproval` et « approvals.handle » pourrait
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

  await recordAudit({
    session,
    action: "REPLY_APPROVED",
    ticket: await auditRefFor(message.ticketId),
    // L'auteur de la réponse et son valideur sont deux personnes différentes
    // (la garde ci-dessus l'impose) : le journal doit nommer les deux, sinon la
    // trace laisse croire que le valideur a écrit la réponse.
    summary: `Validation de la réponse rédigée par ${await agentLabelById(
      message.agentId,
    )}. ${replySummary(result)}`,
  });

  revalidatePath(`/tickets/${message.ticketId}`);
  return result;
}

export async function rejectMessage(messageId: string) {
  const session = await requirePermission("approvals.handle");

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.approvalStatus !== "PENDING") {
    throw new Error("Ce message n'est plus en attente de validation.");
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { approvalStatus: "REJECTED" },
  });

  await recordAudit({
    session,
    action: "REPLY_REJECTED",
    ticket: await auditRefFor(message.ticketId),
    summary: `Refus de la réponse rédigée par ${await agentLabelById(
      message.agentId,
    )} — rien n'est parti au client.`,
  });

  revalidatePath(`/tickets/${message.ticketId}`);
}

/** Référence d'audit d'un ticket connu par son seul identifiant. */
async function auditRefFor(ticketId: string): Promise<AuditTicketRef | null> {
  return prisma.ticket.findUnique({ where: { id: ticketId }, select: auditRefSelect() });
}

async function agentLabelById(agentId: string | null) {
  if (!agentId) return "un agent";
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { name: true, email: true },
  });
  return agent?.name || agent?.email || "un agent";
}
