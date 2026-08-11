import { prisma } from "@/lib/prisma";
import { sendTicketAssignedEmail } from "@/lib/gmail-send";

/**
 * Prévient un agent qu'un ticket vient de lui être confié : une ligne pour la
 * cloche du dashboard et un email, comme pour les mentions.
 *
 * Une assignation était jusqu'ici totalement silencieuse — le ticket changeait
 * de main sans que le destinataire l'apprenne autrement qu'en parcourant la
 * liste. Rien ne partait non plus quand un agent se l'attribuait lui-même : ce
 * cas reste volontairement muet (voir l'exclusion de l'auteur ci-dessous).
 *
 * Best-effort : ne lève jamais, un souci d'email ne doit pas faire échouer
 * l'enregistrement de l'assignation.
 */
export async function notifyTicketAssigned({
  ticketId,
  assigneeId,
  actorId,
}: {
  ticketId: string;
  assigneeId: string;
  actorId: string;
}): Promise<void> {
  // S'assigner un ticket soi-même n'a personne à prévenir.
  if (assigneeId === actorId) return;

  try {
    const [ticket, assignee, actor] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          number: true,
          subject: true,
          status: { select: { name: true } },
          priority: { select: { name: true } },
        },
      }),
      prisma.agent.findUnique({
        where: { id: assigneeId },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          approvalStatus: true,
          notifyOnAssignment: true,
        },
      }),
      prisma.agent.findUnique({ where: { id: actorId }, select: { name: true } }),
    ]);

    if (!ticket || !assignee) return;
    // Un compte désactivé ou non approuvé ne consulte rien : ni cloche ni email.
    if (!assignee.isActive || assignee.approvalStatus !== "APPROVED") return;

    const actorName = actor?.name ?? "Un agent";

    await prisma.notification.create({
      data: {
        type: "ASSIGNMENT",
        // Même rôle que pour les mentions : l'extrait fige ce qui est affiché
        // dans la cloche, il reste lisible si le sujet du ticket change ensuite.
        excerpt: `Ticket #${ticket.number} — ${ticket.subject}`,
        recipientId: assignee.id,
        actorId,
        ticketId: ticket.id,
      },
    });

    // La ligne de cloche part toujours ; seul l'EMAIL se coupe depuis la fiche
    // de l'agent. Les deux ne jouent pas le même rôle : la cloche se consulte
    // quand on est dans l'application, l'email va chercher quelqu'un qui n'y est
    // pas. Couper le second ne doit pas priver l'intéressé du premier.
    if (!assignee.notifyOnAssignment) return;

    const result = await sendTicketAssignedEmail({
      to: assignee.email,
      recipientName: assignee.name,
      actorName,
      ticket: {
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        statusName: ticket.status.name,
        priorityName: ticket.priority.name,
      },
    });
    if (!result.sent) {
      console.error(`[assignation] email non envoyé à ${assignee.id} : ${result.error}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    console.error(`[assignation] notification non envoyée pour le ticket ${ticketId} : ${reason}`);
  }
}
