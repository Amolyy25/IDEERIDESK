import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { htmlToPlainText } from "@/lib/article-html";
import { PERMISSIONS, effectivePermissions } from "@/lib/permissions";
import {
  SUBJECT_KIND_LABELS,
  isSearchableName,
  type SubjectKind,
  type SubjectSummary,
} from "@/lib/privacy-subject";

/**
 * Ce que l'application sait d'une personne, rassemblé en un dossier.
 *
 * C'est la matière de l'export en une action (droit d'accès, art. 15) ET de
 * l'écran qui annonce ce qu'un effacement va toucher. Les deux lisent la même
 * fonction, exprès : un écran qui promet « 3 tickets » et un fichier qui en
 * contient 5 rendrait les deux suspects.
 *
 * Le dossier est lu d'un bloc, sans pagination, à une exception près : le journal
 * d'audit, qui compte une ligne par consultation et peut donc être long. La route
 * d'export le parcourt en lots, avec `subjectJournalWhere` ci-dessous.
 *
 * Ce qui n'y entre PAS, et c'est délibéré :
 *   — les OCTETS des pièces jointes. Leur description suffit à savoir ce que
 *     l'application détient ; recopier des mégaoctets de fichiers dans un CSV le
 *     rendrait inexploitable, et ces fichiers restent téléchargeables depuis leur
 *     ticket.
 *   — les jetons Gmail, clés d'API et autres secrets techniques : ce ne sont pas
 *     les données de la personne, et un export circule par email.
 */

// ---------------------------------------------------------------------------
// Formes lues en base
// ---------------------------------------------------------------------------

const clientSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  createdAt: true,
  updatedAt: true,
  anonymizedAt: true,
  // Le rattachement de fusion. Une fiche absorbée n'est plus le contact actif,
  // mais elle porte toujours une identité : le dossier doit dire vers qui elle
  // renvoie, sinon la personne s'étonnerait à juste titre qu'il ne mentionne
  // aucun de ses tickets — ils sont sur l'autre fiche.
  mergedInto: { select: { name: true } },
  mergedAt: true,
} satisfies Prisma.ClientSelect;

const agentSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  approvalStatus: true,
  approvalDecidedAt: true,
  requiresApproval: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
  anonymizedAt: true,
  groups: { select: { name: true } },
} satisfies Prisma.AgentSelect;

export type SubjectRecord =
  | { kind: "CLIENT"; client: Prisma.ClientGetPayload<{ select: typeof clientSelect }> }
  | { kind: "AGENT"; agent: Prisma.AgentGetPayload<{ select: typeof agentSelect }> };

/** La personne visée, ou `null` si l'identifiant ne désigne plus rien. */
export async function readSubjectRecord(
  kind: SubjectKind,
  id: string,
): Promise<SubjectRecord | null> {
  if (kind === "CLIENT") {
    const client = await prisma.client.findUnique({ where: { id }, select: clientSelect });
    return client ? { kind: "CLIENT", client } : null;
  }

  const agent = await prisma.agent.findUnique({ where: { id }, select: agentSelect });
  return agent ? { kind: "AGENT", agent } : null;
}

/** Nom et email courants, sans se soucier du type de personne. */
export function subjectIdentity(record: SubjectRecord): { name: string; email: string } {
  return record.kind === "CLIENT"
    ? { name: record.client.name, email: record.client.email }
    : { name: record.agent.name, email: record.agent.email };
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

/**
 * Nombre de personnes rapportées par type.
 *
 * Une recherche RGPD part d'une demande nominative : on cherche UNE personne,
 * connue par son email. Une liste courte suffit donc, et surtout : elle évite
 * qu'un écran portant deux gestes irréversibles serve à parcourir tout le
 * répertoire.
 */
const SEARCH_LIMIT = 8;

/**
 * Personnes correspondant à la recherche, clients et agents mêlés.
 *
 * La recherche à vide ne renvoie rien, volontairement : sur cet écran, une liste
 * qui s'affiche d'elle-même est une liste de cibles pour un clic de trop.
 */
export async function searchSubjectSummaries(term: string): Promise<SubjectSummary[]> {
  const search = term.trim();
  if (search.length < 2) return [];

  const contains = { contains: search, mode: "insensitive" as const };

  const [clients, agents] = await Promise.all([
    prisma.client.findMany({
      where: { OR: [{ name: contains }, { email: contains }, { company: contains }] },
      select: clientSelect,
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    }),
    prisma.agent.findMany({
      where: { OR: [{ name: contains }, { email: contains }] },
      select: agentSelect,
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    }),
  ]);

  // Un décompte par personne plutôt qu'un `groupBy` : au plus seize lignes, et
  // les deux décomptes ne se formulent pas de la même façon (l'agent est l'AUTEUR
  // de ses traces, le client en est le SUJET, à travers ses tickets).
  return Promise.all([
    ...clients.map(async (client): Promise<SubjectSummary> => {
      const [ticketCount, journalEntryCount] = await Promise.all([
        prisma.ticket.count({ where: { clientId: client.id } }),
        prisma.auditLog.count({ where: { ticket: { clientId: client.id } } }),
      ]);
      return {
        kind: "CLIENT",
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        createdAt: client.createdAt,
        anonymizedAt: client.anonymizedAt,
        ticketCount,
        journalEntryCount,
        isActive: null,
        roleLabel: null,
      };
    }),
    ...agents.map(async (agent): Promise<SubjectSummary> => {
      const [ticketCount, journalEntryCount] = await Promise.all([
        prisma.ticket.count({ where: { assigneeId: agent.id } }),
        prisma.auditLog.count({ where: { actorId: agent.id } }),
      ]);
      return {
        kind: "AGENT",
        id: agent.id,
        name: agent.name,
        email: agent.email,
        phone: null,
        company: agent.groups.map((group) => group.name).join(", ") || null,
        createdAt: agent.createdAt,
        anonymizedAt: agent.anonymizedAt,
        ticketCount,
        journalEntryCount,
        isActive: agent.isActive,
        roleLabel: agent.role === "ADMIN" ? "Administrateur" : "Agent",
      };
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Dossier complet
// ---------------------------------------------------------------------------

export type DossierField = { label: string; value: string | number | Date | null };

export type DossierTicket = {
  number: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  source: string;
  assignee: string | null;
  client: string | null;
  createdAt: Date;
  closedAt: Date | null;
  customFields: string;
};

export type DossierMessage = {
  ticketNumber: number;
  createdAt: Date;
  author: string;
  authorType: string;
  visibility: string;
  emailSent: boolean;
  content: string;
};

export type DossierAttachment = {
  ticketNumber: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

export type DossierNotification = {
  createdAt: Date;
  type: string;
  ticketNumber: number | null;
  excerpt: string;
  readAt: Date | null;
};

export type SubjectDossier = {
  kind: SubjectKind;
  id: string;
  identity: DossierField[];
  tickets: DossierTicket[];
  messages: DossierMessage[];
  attachments: DossierAttachment[];
  notifications: DossierNotification[];
  /** Ce que le dossier ne peut pas contenir, écrit noir sur blanc dans le fichier. */
  limits: string[];
};

const ticketSelect = {
  id: true,
  number: true,
  subject: true,
  description: true,
  source: true,
  metadata: true,
  createdAt: true,
  closedAt: true,
  status: { select: { name: true } },
  priority: { select: { name: true } },
  category: { select: { name: true } },
  assignee: { select: { name: true } },
  client: { select: { name: true, email: true } },
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

/**
 * Champs personnalisés d'un ticket, réduits à la liste de leurs clés.
 *
 * Leur CONTENU est bien la donnée de la personne et devrait figurer dans un
 * export d'accès — mais il est stocké en JSON libre par clé technique, sans le
 * libellé du champ, et un formulaire supprimé depuis laisse des clés qu'on ne
 * sait plus nommer. Les lister sans les interpréter est la seule lecture qu'on
 * puisse garantir exacte ; la limite est annoncée dans le fichier.
 */
function customFieldKeys(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return "";
  return Object.keys(metadata as Record<string, unknown>)
    .filter((key) => !key.startsWith("_"))
    .sort()
    .join(", ");
}

function toDossierTicket(ticket: TicketRow): DossierTicket {
  return {
    number: ticket.number,
    subject: ticket.subject,
    description: htmlToPlainText(ticket.description),
    status: ticket.status.name,
    priority: ticket.priority.name,
    category: ticket.category?.name ?? null,
    source: ticket.source,
    assignee: ticket.assignee?.name ?? null,
    client: ticket.client ? `${ticket.client.name} <${ticket.client.email}>` : null,
    createdAt: ticket.createdAt,
    closedAt: ticket.closedAt,
    customFields: customFieldKeys(ticket.metadata),
  };
}

/** Limites communes aux deux types de dossier, écrites dans le fichier remis. */
const SHARED_LIMITS = [
  "Les pièces jointes sont décrites (nom, type, taille) mais leur contenu n'est pas recopié ici : les fichiers restent téléchargeables depuis leur ticket.",
  "Le contenu des champs personnalisés d'un ticket n'est pas repris : seules les clés des champs renseignés sont listées (voir la colonne « Champs personnalisés renseignés »).",
  "Les messages sont convertis en texte brut : la mise en forme d'origine (gras, liens, images) n'est pas restituée.",
];

async function readClientDossier(id: string): Promise<SubjectDossier | null> {
  const client = await prisma.client.findUnique({ where: { id }, select: clientSelect });
  if (!client) return null;

  const tickets = await prisma.ticket.findMany({
    where: { clientId: id },
    select: ticketSelect,
    orderBy: { number: "asc" },
  });
  const ticketIds = tickets.map((ticket) => ticket.id);
  const numberOf = new Map(tickets.map((ticket) => [ticket.id, ticket.number]));

  const [messages, attachments] = await Promise.all([
    prisma.message.findMany({
      where: { ticketId: { in: ticketIds } },
      select: {
        ticketId: true,
        content: true,
        authorType: true,
        isPrivate: true,
        emailSent: true,
        createdAt: true,
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.attachment.findMany({
      where: { ticketId: { in: ticketIds } },
      // `data` volontairement absent du select : lire les octets pour ne pas les
      // écrire chargerait toute la base documentaire du client en mémoire.
      select: { ticketId: true, filename: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    kind: "CLIENT",
    id,
    identity: [
      { label: "Type de personne", value: SUBJECT_KIND_LABELS.CLIENT },
      { label: "Nom", value: client.name },
      { label: "Email", value: client.email },
      // Lignes absentes quand la fiche n'est pas rattachée, plutôt que des cases
      // vides : la majorité des fiches ne le sont pas, et « Fusionnée dans : — »
      // ferait chercher un sens là où il n'y en a pas.
      ...(client.mergedInto
        ? [
            { label: "Fiche rattachée au contact", value: client.mergedInto.name },
            { label: "Rattachée le", value: client.mergedAt },
          ]
        : []),
      { label: "Téléphone", value: client.phone },
      { label: "Société", value: client.company },
      { label: "Fiche créée le", value: client.createdAt },
      { label: "Fiche modifiée le", value: client.updatedAt },
      { label: "Identité anonymisée le", value: client.anonymizedAt },
      { label: "Nombre de tickets", value: tickets.length },
    ],
    tickets: tickets.map(toDossierTicket),
    messages: messages.map((message) => ({
      ticketNumber: numberOf.get(message.ticketId) ?? 0,
      createdAt: message.createdAt,
      author:
        message.authorType === "CLIENT"
          ? client.name
          : (message.agent?.name ?? "Compte supprimé depuis"),
      authorType: authorTypeLabel(message.authorType),
      visibility: message.isPrivate ? "Note interne" : "Visible du client",
      emailSent: message.emailSent,
      content: htmlToPlainText(message.content),
    })),
    attachments: attachments.map((attachment) => ({
      ticketNumber: numberOf.get(attachment.ticketId) ?? 0,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt,
    })),
    notifications: [],
    limits: [
      ...SHARED_LIMITS,
      // Dit ici parce que c'est la vraie limite du dossier d'un client : les notes
      // internes le concernent et lui sont communicables, mais elles nomment aussi
      // des agents. Un export d'accès ne doit pas devenir une fuite sur l'équipe.
      "Les notes internes de l'équipe figurent dans ce dossier, y compris le nom de leur auteur : vérifiez ce point avant toute remise à la personne concernée.",
      "Le dossier couvre les tickets encore présents dans l'application. Un ticket supprimé n'en laisse qu'une trace au journal d'audit, sans son fil de conversation.",
    ],
  };
}

async function readAgentDossier(id: string): Promise<SubjectDossier | null> {
  const agent = await prisma.agent.findUnique({ where: { id }, select: agentSelect });
  if (!agent) return null;

  const [tickets, messages, notifications] = await Promise.all([
    prisma.ticket.findMany({
      where: { assigneeId: id },
      select: ticketSelect,
      orderBy: { number: "asc" },
    }),
    prisma.message.findMany({
      where: { agentId: id },
      select: {
        content: true,
        authorType: true,
        isPrivate: true,
        emailSent: true,
        createdAt: true,
        ticket: { select: { number: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({
      where: { recipientId: id },
      select: {
        type: true,
        excerpt: true,
        readAt: true,
        createdAt: true,
        ticket: { select: { number: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const granted = effectivePermissions(agent);

  return {
    kind: "AGENT",
    id,
    identity: [
      { label: "Type de personne", value: SUBJECT_KIND_LABELS.AGENT },
      { label: "Nom", value: agent.name },
      { label: "Email", value: agent.email },
      { label: "Rôle", value: agent.role === "ADMIN" ? "Administrateur" : "Agent" },
      { label: "Compte actif", value: agent.isActive ? "oui" : "non" },
      { label: "Statut de la demande d'accès", value: approvalLabel(agent.approvalStatus) },
      { label: "Accès tranché le", value: agent.approvalDecidedAt },
      { label: "Réponses soumises à validation", value: agent.requiresApproval ? "oui" : "non" },
      {
        label: "Permissions effectives",
        value: granted.map((key) => PERMISSIONS[key].label).join(", ") || "Aucune",
      },
      { label: "Groupes", value: agent.groups.map((group) => group.name).join(", ") || "Aucun" },
      { label: "Compte créé le", value: agent.createdAt },
      { label: "Compte modifié le", value: agent.updatedAt },
      { label: "Identité anonymisée le", value: agent.anonymizedAt },
    ],
    tickets: tickets.map(toDossierTicket),
    messages: messages.map((message) => ({
      ticketNumber: message.ticket.number,
      createdAt: message.createdAt,
      author: agent.name,
      authorType: authorTypeLabel(message.authorType),
      visibility: message.isPrivate ? "Note interne" : "Visible du client",
      emailSent: message.emailSent,
      content: htmlToPlainText(message.content),
    })),
    // Pièces jointes non listées pour un agent : elles appartiennent au dossier du
    // client qui les a déposées, pas à l'agent qui les a lues.
    attachments: [],
    notifications: notifications.map((notification) => ({
      createdAt: notification.createdAt,
      type: notification.type === "MENTION" ? "Mention @" : "Assignation",
      ticketNumber: notification.ticket?.number ?? null,
      excerpt: notification.excerpt,
      readAt: notification.readAt,
    })),
    limits: [
      ...SHARED_LIMITS,
      "La colonne « Tickets » liste les dossiers qui lui sont assignés aujourd'hui, pas ceux qu'il a traités puis passés à un collègue — le journal d'audit, lui, en garde la trace.",
      ...(isSearchableName(agent.name)
        ? []
        : [
            `Son nom (« ${agent.name} ») est trop court pour être cherché sans risque dans du texte libre : une anonymisation ne pourra pas le retirer des phrases du journal, seul son email le sera.`,
          ]),
    ],
  };
}

export function readSubjectDossier(
  kind: SubjectKind,
  id: string,
): Promise<SubjectDossier | null> {
  return kind === "CLIENT" ? readClientDossier(id) : readAgentDossier(id);
}

function authorTypeLabel(authorType: "AGENT" | "CLIENT" | "SYSTEM"): string {
  if (authorType === "AGENT") return "Agent";
  if (authorType === "CLIENT") return "Client";
  return "Automatique";
}

function approvalLabel(status: "PENDING" | "APPROVED" | "REJECTED"): string {
  if (status === "APPROVED") return "Approuvée";
  if (status === "REJECTED") return "Refusée";
  return "En attente";
}

// ---------------------------------------------------------------------------
// Le journal, à part
// ---------------------------------------------------------------------------

/**
 * Les lignes du journal qui concernent la personne.
 *
 * Renvoyé comme un `where` et non comme des lignes : c'est la table qui grossit
 * le plus vite du schéma, la route d'export la parcourt donc en lots plutôt que
 * de la charger en mémoire.
 *
 * Un AGENT est l'AUTEUR de traces (`actorId`), et il est aussi NOMMÉ dans le
 * résumé de celles qui portent sur son compte ou sur une réponse qu'il a rédigée
 * — les deux lui sont communicables. Un CLIENT n'est l'auteur de rien : ce qui le
 * concerne, ce sont les gestes posés sur ses tickets.
 */
export function subjectJournalWhere(
  record: SubjectRecord,
): Prisma.AuditLogWhereInput {
  if (record.kind === "CLIENT") {
    return { ticket: { clientId: record.client.id } };
  }

  const { name, email } = record.agent;
  return {
    OR: [
      { actorId: record.agent.id },
      { summary: { contains: email } },
      ...(isSearchableName(name) ? [{ summary: { contains: name } }] : []),
    ],
  };
}
