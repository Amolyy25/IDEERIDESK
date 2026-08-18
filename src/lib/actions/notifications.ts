"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireApprovedAgent } from "@/lib/require-permission";

const notificationSelect = {
  id: true,
  type: true,
  excerpt: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
  ticket: { select: { id: true, number: true, subject: true } },
  // Sert à ouvrir le ticket directement sur la note citée : dans un fil long,
  // « vous a mentionné » sans point de chute laisse chercher la note à la main.
  messageId: true,
} satisfies Prisma.NotificationSelect;

// Dérivé de la requête, comme `TicketListItem` : un champ ajouté au `select`
// suit dans le type, au lieu d'une copie manuelle qui dérive en silence.
export type NotificationItem = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

/**
 * Les 20 dernières notifications de l'agent connecté, plus son compteur non lu.
 *
 * Type de retour volontairement inféré : une annotation `Promise<{…}>` ferait
 * lire à `scripts/check-action-guards.mjs` l'objet du type comme corps de la
 * fonction, et l'action passerait pour non gardée.
 */
export async function getMyNotifications() {
  const session = await requireApprovedAgent();
  const recipientId = session.user.id;

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId },
      select: notificationSelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { recipientId, readAt: null } }),
  ]);

  return { items, unreadCount };
}

/**
 * Marque des notifications comme lues. Le filtre porte toujours sur le
 * destinataire de la session : un identifiant appartenant à un collègue ne
 * correspond à aucune ligne et reste donc non lu chez lui.
 */
export async function markNotificationsRead(ids: string[]) {
  const session = await requireApprovedAgent();
  if (ids.length === 0) return;

  await prisma.notification.updateMany({
    where: { id: { in: ids }, recipientId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead() {
  const session = await requireApprovedAgent();
  await prisma.notification.updateMany({
    where: { recipientId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
}
