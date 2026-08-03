import { prisma } from "@/lib/prisma";

/**
 * Réouvre un ticket clos sur lequel le client vient de reprendre la parole.
 *
 * Sans ça, une réponse arrivée après la clôture était bien enregistrée dans le
 * fil mais laissait le ticket fermé : il ne remontait dans aucune vue d'agent,
 * et le client attendait une réponse que personne ne voyait à écrire.
 *
 * Statut cible : celui marqué `isReopenDefault` dans Paramètres > Statuts, à
 * défaut le statut par défaut des nouveaux tickets. Dans les deux cas un statut
 * fermé est écarté — rouvrir vers un statut fermé ne rouvrirait rien.
 *
 * Best-effort et sans exception : appelé depuis la synchro Gmail, où un souci
 * de configuration ne doit pas faire perdre le message entrant.
 */
export async function reopenClosedTicket(ticketId: string): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { closedAt: true, status: { select: { isClosed: true } } },
  });
  if (!ticket) return false;

  // `closedAt` seul ne suffit pas : un ticket passé en statut fermé à la main
  // via le panneau d'attributs porte les deux, mais une clôture par
  // automatisation vers un statut fermé peut n'avoir que le statut.
  if (!ticket.status.isClosed && ticket.closedAt === null) return false;

  const target =
    (await prisma.ticketStatus.findFirst({
      where: { isReopenDefault: true, isClosed: false },
    })) ??
    (await prisma.ticketStatus.findFirst({
      where: { isDefault: true, isClosed: false },
      orderBy: { order: "asc" },
    }));

  if (!target) {
    console.error(
      `[reopen] ticket ${ticketId} laissé clos : aucun statut ouvert utilisable. ` +
        `Marquez un statut « appliqué à la réouverture » dans Paramètres > Statuts.`
    );
    return false;
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { statusId: target.id, closedAt: null },
  });

  await prisma.message.create({
    data: {
      ticketId,
      content: `Ticket réouvert automatiquement (statut « ${target.name} ») : le client a répondu après la clôture.`,
      authorType: "SYSTEM",
      isPrivate: true,
    },
  });

  return true;
}
