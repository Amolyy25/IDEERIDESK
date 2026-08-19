"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/require-permission";
import { breachedSlaWhere } from "@/lib/sla";

// Compteurs de tickets : pastille de la barre latérale et bande de vues. À part
// de `tickets.ts`, qui porte la lecture et l'écriture des tickets eux-mêmes.

export async function getUnreadTicketCount() {
  await requirePermission("tickets.view");
  // Clos exclus, comme dans la file : la pastille renvoie vers une liste où
  // le ticket compté doit être visible.
  return prisma.ticket.count({
    where: { hasUnreadActivity: true, status: { isClosed: false } },
  });
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
