/**
 * Formes de lecture d'un ticket : `include` Prisma, types dérivés, `where` de la liste.
 *
 * Sans `"use server"` : un fichier d'actions ne peut exporter que des fonctions
 * asynchrones, pas une constante (même raison que `ticket-filters.ts`).
 */

import type { Prisma } from "@/generated/prisma/client";
import { SLA_BREACHED_FILTER, UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import { breachedSlaWhere } from "@/lib/sla";

export const ticketInclude = {
  status: true,
  priority: true,
  category: true,
  assignee: true,
  client: true,
} satisfies Prisma.TicketInclude;

export type TicketListItem = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

// `data` (le contenu binaire) écarté partout : une fiche avec quelques pièces
// jointes ferait sinon transiter plusieurs Mo par rendu, alors que le
// téléchargement passe par /api/attachments/[id].
export const ticketDetailInclude = {
  ...ticketInclude,
  messages: {
    include: {
      agent: true,
      attachments: { omit: { data: true } },
    },
  },
  attachments: { omit: { data: true } },

  // Fusion : le ticket d'accueil, et les doublons absorbés avec leur demande,
  // leurs échanges publics et leurs pièces jointes — de quoi tout traiter depuis
  // cette seule fiche. Les notes internes des doublons restent chez eux.
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
          contentHtml: true,
          authorType: true,
          emailSent: true,
          createdAt: true,
          agent: { select: { name: true, avatarUrl: true } },
          attachments: { omit: { data: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
      // Comme sur la fiche principale : seules les pièces de la demande initiale,
      // celles des réponses étant déjà rattachées à leur message.
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

/** Doublon absorbé par un ticket, avec la conversation qu'il apporte. */
export type MergedTicket = TicketWithMessages["mergedTickets"][number];

/** Message d'un doublon : moins de champs qu'un message du ticket d'accueil. */
export type MergedTicketMessage = MergedTicket["messages"][number];

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

export function buildTicketListWhere(filters: TicketListFilters): Prisma.TicketWhereInput {
  const search = filters.search?.trim();

  // « 128 » cherche comme « #128 » : le numéro est repris dans l'objet des emails
  // et affiché partout, c'est le premier terme qu'un agent tape.
  const searchedNumber = search ? Number(search.replace(/^#/, "")) : Number.NaN;
  const numberMatch: Prisma.TicketWhereInput[] =
    Number.isInteger(searchedNumber) && searchedNumber > 0 ? [{ number: searchedNumber }] : [];

  return {
    statusId: filters.statusId || undefined,
    priorityId: filters.priorityId || undefined,
    categoryId: filters.categoryId || undefined,
    // `null` et non `undefined` : « non assigné » est une condition à part
    // entière, pas l'absence de filtre.
    assigneeId:
      filters.assigneeId === UNASSIGNED_FILTER ? null : filters.assigneeId || undefined,
    ...(!filters.categoryId && filters.categoryIds?.length
      ? { categoryId: { in: filters.categoryIds } }
      : {}),
    // Dans `AND` : `breachedSlaWhere` porte son propre `OR` et la recherche en
    // pose un autre juste en dessous — deux `OR` au même niveau s'écraseraient.
    //
    // `status.isClosed` en plus de `closedAt` : une clôture par automatisation
    // peut n'avoir que le statut, et cette vue ne liste que ce qui reste à faire.
    ...(filters.sla === SLA_BREACHED_FILTER
      ? { AND: [breachedSlaWhere(), { status: { isClosed: false } }] }
      : {}),
    ...(search
      ? {
          OR: [
            ...numberMatch,
            { subject: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            // Le corps du fil : une référence de dossier ou un message d'erreur
            // donnés en cours de conversation ne sont ni dans le sujet ni dans
            // la demande initiale.
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
}
