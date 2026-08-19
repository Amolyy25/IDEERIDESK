import { prisma } from "@/lib/prisma";
import { computeSlaDueDates } from "@/lib/sla";
import { applyStatusPauseFlagChange, readSlaCalendar } from "@/lib/sla-store";
import {
  buildCategoryImpact,
  buildPriorityImpact,
  buildStatusImpact,
  type DeletionImpact,
} from "@/lib/ticket-attribute-impact";

// Lecture en base de ce que la suppression d'un statut, d'une priorité ou d'un
// produit entraînerait, et application du déplacement quand elle a lieu. Le
// calcul, lui, est pur et vit dans `ticket-attribute-impact.ts` — même partage
// que `sla.ts` / `sla-store.ts`.

export async function getStatusDeletionImpacts(): Promise<Record<string, DeletionImpact>> {
  const [statuses, counts, rules] = await Promise.all([
    prisma.ticketStatus.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        isClosed: true,
        isCloseDefault: true,
        isInProgressDefault: true,
        isReopenDefault: true,
      },
    }),
    prisma.ticket.groupBy({ by: ["statusId"], _count: { _all: true } }),
    prisma.automationRule.findMany({
      select: { name: true, triggerStatusId: true, actionStatusId: true },
    }),
  ]);

  const countById = ticketCounts(counts.map((row) => [row.statusId, row._count._all]));
  return Object.fromEntries(
    statuses.map((status) => [
      status.id,
      buildStatusImpact({ status, statuses, ticketCount: countById(status.id), rules }),
    ])
  );
}

export async function getPriorityDeletionImpacts(): Promise<Record<string, DeletionImpact>> {
  const [priorities, counts, rules] = await Promise.all([
    prisma.ticketPriority.findMany({ select: { id: true, name: true, isDefault: true } }),
    prisma.ticket.groupBy({ by: ["priorityId"], _count: { _all: true } }),
    prisma.automationRule.findMany({
      select: { name: true, actionPriorityId: true, triggerPriorityIds: true },
    }),
  ]);

  const countById = ticketCounts(counts.map((row) => [row.priorityId, row._count._all]));
  return Object.fromEntries(
    priorities.map((priority) => [
      priority.id,
      buildPriorityImpact({ priority, priorities, ticketCount: countById(priority.id), rules }),
    ])
  );
}

export async function getCategoryDeletionImpacts(): Promise<Record<string, DeletionImpact>> {
  const [categories, counts, rules] = await Promise.all([
    prisma.ticketCategory.findMany({ select: { id: true } }),
    prisma.ticket.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.automationRule.findMany({ select: { name: true, triggerCategoryIds: true } }),
  ]);

  const countById = ticketCounts(counts.map((row) => [row.categoryId, row._count._all]));
  return Object.fromEntries(
    categories.map((category) => [
      category.id,
      buildCategoryImpact({
        categoryId: category.id,
        ticketCount: countById(category.id),
        rules,
      }),
    ])
  );
}

/** Déplace les tickets d'un statut qui disparaît vers le statut de reprise. */
export async function moveTicketsOffStatus(fromId: string, toId: string) {
  const [from, to] = await Promise.all([
    prisma.ticketStatus.findUnique({ where: { id: fromId }, select: { pausesSla: true } }),
    prisma.ticketStatus.findUnique({
      where: { id: toId },
      select: { pausesSla: true, isClosed: true },
    }),
  ]);
  if (!from || !to) return;

  // Reprise de l'horloge AVANT le déplacement : cette fonction cible les tickets
  // par statut, elle doit encore les trouver sur celui qui disparaît.
  if (from.pausesSla && !to.pausesSla) {
    await applyStatusPauseFlagChange({ statusId: fromId, pausesSla: false });
  }

  if (to.isClosed) {
    await prisma.ticket.updateMany({
      where: { statusId: fromId, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  await prisma.ticket.updateMany({
    where: { statusId: fromId },
    // `closedAt` remis à null vers un statut ouvert : sans ça le ticket
    // réapparaît dans la file en se disant résolu (voir `updateTicketAttributes`).
    data: { statusId: toId, ...(to.isClosed ? {} : { closedAt: null }) },
  });

  if (!from.pausesSla && to.pausesSla) {
    await applyStatusPauseFlagChange({ statusId: toId, pausesSla: true });
  }
}

/** Idem pour une priorité, échéances SLA recalculées : ce sont elles qui la portent. */
export async function moveTicketsOffPriority(fromId: string, toId: string) {
  const [tickets, target, calendar] = await Promise.all([
    prisma.ticket.findMany({
      where: { priorityId: fromId },
      select: { id: true, createdAt: true, slaPausedMs: true },
    }),
    prisma.ticketPriority.findUnique({
      where: { id: toId },
      select: { firstResponseMinutes: true, resolutionMinutes: true },
    }),
    readSlaCalendar(),
  ]);
  if (!target || tickets.length === 0) return;

  // Depuis la date d'arrivée du ticket et non depuis maintenant, comme un
  // changement de priorité à l'unité : l'engagement porte sur l'attente du client.
  await prisma.$transaction(
    tickets.map((ticket) =>
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          priorityId: toId,
          ...computeSlaDueDates({
            from: ticket.createdAt,
            targets: target,
            calendar,
            alreadyPausedMs: ticket.slaPausedMs,
          }),
          firstResponseWarnedAt: null,
          resolutionWarnedAt: null,
        },
      })
    )
  );
}

export async function clearCategoryOnTickets(categoryId: string) {
  await prisma.ticket.updateMany({ where: { categoryId }, data: { categoryId: null } });
}

/** Les comptes de `groupBy` en fonction de lecture, clés nulles écartées. */
function ticketCounts(rows: [string | null, number][]) {
  const byId = new Map(rows.filter(([id]) => id !== null) as [string, number][]);
  return (id: string) => byId.get(id) ?? 0;
}
