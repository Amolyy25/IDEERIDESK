import { prisma } from "@/lib/prisma";
import { sendSlaWarningEmail } from "@/lib/gmail-send";
import { formatDateTime } from "@/lib/format-date";
import { formatSlaDuration, slaTargetLabels, type SlaTarget } from "@/lib/sla";
import { readSlaWarningMinutes } from "@/lib/sla-store";

/**
 * Prévient par email que l'échéance d'un ticket approche.
 *
 * Appelé par un ordonnanceur externe via `/api/cron/sla`, comme les
 * automatisations et la synchro Gmail — il n'y a pas de canal temps réel dans ce
 * projet, une horloge se relève donc par battements.
 *
 * Trois décisions structurent ce passage :
 *
 *   — UN SEUL EMAIL PAR ÉCHÉANCE. Le balayage repasse toutes les quelques
 *     minutes et retrouverait le même ticket à chaque fois ; l'horodatage posé
 *     sur la ligne fait foi. Il est réarmé quand l'échéance change (priorité,
 *     réouverture, sortie de suspension), parce que c'est alors une autre date ;
 *   — ON N'ALERTE PAS APRÈS COUP. Une échéance déjà dépassée ne déclenche rien :
 *     « il vous reste 30 minutes » envoyé deux heures trop tard est un message
 *     faux. Ces tickets-là sont dans la vue « SLA en retard », qui est faite pour
 *     eux ;
 *   — LE TICKET NON ASSIGNÉ N'EST PAS ORPHELIN. Faute d'assigné, l'alerte part
 *     aux membres des groupes couvrant son produit — c'est justement le dossier
 *     que personne n'a pris qui dépasse l'échéance.
 *
 * Best-effort de bout en bout : un échec d'envoi est journalisé et n'interrompt
 * pas le passage.
 */
export async function runSlaWarnings(now: Date = new Date()) {
  const leadMinutes = await readSlaWarningMinutes();
  if (leadMinutes === 0) {
    return { warned: 0, skipped: 0, disabled: true as const };
  }

  const horizon = new Date(now.getTime() + leadMinutes * 60_000);

  const open = {
    closedAt: null,
    // Une horloge suspendue ne court pas vers son échéance.
    slaPausedAt: null,
    status: { isClosed: false },
  };

  const [firstResponse, resolution] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...open,
        firstRespondedAt: null,
        firstResponseWarnedAt: null,
        firstResponseDueAt: { gt: now, lte: horizon },
      },
      select: ticketSelect,
    }),
    prisma.ticket.findMany({
      where: {
        ...open,
        resolutionWarnedAt: null,
        resolutionDueAt: { gt: now, lte: horizon },
      },
      select: ticketSelect,
    }),
  ]);

  let warned = 0;
  let skipped = 0;

  for (const target of ["first_response", "resolution"] as const) {
    const tickets = target === "first_response" ? firstResponse : resolution;

    for (const ticket of tickets) {
      const dueAt = target === "first_response" ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
      if (!dueAt) continue;

      const recipients = await warningRecipients(ticket);

      // Marqué même sans destinataire : sans ça, un ticket sans assigné ni
      // groupe serait relu à chaque passage jusqu'à son échéance. La marque dit
      // « ce passage a traité cette échéance », pas « un email est parti ».
      await markWarned(ticket.id, target, now);

      if (recipients.length === 0) {
        skipped += 1;
        continue;
      }

      const payload = {
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        targetLabel: slaTargetLabels[target],
        remainingLabel: formatSlaDuration(dueAt.getTime() - now.getTime()),
        dueLabel: formatDateTime(dueAt),
        priorityName: ticket.priority.name,
        assigneeLabel: ticket.assignee ? `assigné à ${ticket.assignee.name}` : "non assigné",
      };

      await Promise.all(
        recipients.map(async (agent) => {
          try {
            const result = await sendSlaWarningEmail({
              to: agent.email,
              recipientName: agent.name,
              ticket: payload,
            });
            if (!result.sent) {
              console.error(`[sla] alerte non envoyée à ${agent.id} : ${result.error}`);
            }
          } catch (error) {
            console.error(`[sla] alerte non envoyée à ${agent.id}`, error);
          }
        })
      );

      warned += 1;
    }
  }

  return { warned, skipped, disabled: false as const };
}

const ticketSelect = {
  id: true,
  number: true,
  subject: true,
  categoryId: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  priority: { select: { name: true } },
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      approvalStatus: true,
      notifyOnSlaWarning: true,
    },
  },
} as const;

type WarnableTicket = {
  categoryId: string | null;
  assignee: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    approvalStatus: string;
    notifyOnSlaWarning: boolean;
  } | null;
};

/**
 * À qui part l'alerte : l'agent qui tient le dossier, sinon ceux dont c'est la
 * file.
 *
 * L'assigné n'est pas doublé par son groupe — recevoir deux fois le même
 * avertissement apprend à n'en lire aucun. Un assigné désactivé, non approuvé ou
 * qui a coupé cette alerte ne fait PAS retomber l'envoi sur le groupe : le
 * dossier a un responsable, ce n'est pas au reste de l'équipe de recevoir ses
 * rappels.
 */
async function warningRecipients(ticket: WarnableTicket) {
  if (ticket.assignee) {
    const { assignee } = ticket;
    const reachable =
      assignee.isActive && assignee.approvalStatus === "APPROVED" && assignee.notifyOnSlaWarning;
    return reachable ? [assignee] : [];
  }

  if (!ticket.categoryId) return [];

  return prisma.agent.findMany({
    where: {
      isActive: true,
      approvalStatus: "APPROVED",
      notifyOnSlaWarning: true,
      anonymizedAt: null,
      groups: { some: { products: { some: { id: ticket.categoryId } } } },
    },
    select: { id: true, name: true, email: true },
  });
}

function markWarned(ticketId: string, target: SlaTarget, at: Date) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data:
      target === "first_response" ? { firstResponseWarnedAt: at } : { resolutionWarnedAt: at },
  });
}
