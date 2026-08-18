/**
 * `include` Prisma de la liste et de la fiche ticket, et les types dérivés.
 *
 * Sans `"use server"` : un fichier d'actions ne peut exporter que des fonctions
 * asynchrones, pas une constante (même raison que `ticket-filters.ts`).
 */

import type { Prisma } from "@/generated/prisma/client";

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
