import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import { slaFieldsForStatusChange } from "@/lib/sla-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Applies every active automation rule once. Meant to be called on a
 * schedule (see `/api/cron/automations`) — idempotent because a rule always
 * moves its tickets *out* of its own trigger status, so they no longer match
 * on the next run and there's no "already processed" bookkeeping to maintain.
 *
 * Cette idempotence tient à une seule condition : `actionStatusId` doit
 * différer de `triggerStatusId`. Sinon le ticket reste dans le filtre de la
 * règle et chaque passage lui renvoie note et email. La création est désormais
 * refusée dans ce cas (voir `ruleSchema`), mais les règles déjà en base n'ont
 * jamais été validées : elles sont écartées ici plutôt qu'appliquées.
 */
export async function runAutomations() {
  const rules = await prisma.automationRule.findMany({
    where: { isActive: true },
    include: { actionStatus: true },
  });

  let processed = 0;
  let skipped = 0;

  for (const rule of rules) {
    if (rule.actionStatusId === rule.triggerStatusId) {
      skipped += 1;
      console.error(
        `[automations] règle « ${rule.name} » ignorée : statut d'arrivée identique au statut ` +
          `déclencheur, elle se rejouerait sans fin. Corrigez-la dans Paramètres > Règles automatiques.`
      );
      continue;
    }

    const cutoff = new Date(Date.now() - rule.delayDays * DAY_MS);
    const tickets = await prisma.ticket.findMany({
      where: { statusId: rule.triggerStatusId, updatedAt: { lte: cutoff } },
      include: { client: true },
    });

    for (const ticket of tickets) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          statusId: rule.actionStatusId,
          closedAt: rule.actionStatus.isClosed ? new Date() : null,
          // Une règle qui déplace un ticket vers (ou hors d')un statut
          // suspendant l'horloge SLA doit la suspendre ou la relancer comme le
          // ferait un agent : le décompte ne dépend pas de qui a changé le
          // statut.
          ...(await slaFieldsForStatusChange({
            ticketId: ticket.id,
            nextStatusId: rule.actionStatusId,
          })),
        },
      });

      if (rule.addNote) {
        await prisma.message.create({
          data: {
            ticketId: ticket.id,
            content: rule.noteContent,
            authorType: "SYSTEM",
            isPrivate: true,
          },
        });
      }

      if (rule.sendEmail && rule.emailContent && ticket.client?.email) {
        // Lecture sans garde d'accès : `runAutomations` tourne aussi depuis
        // /api/cron/automations, authentifié par un secret et non par une
        // session d'agent. L'action `getEmailAccountStatus` exige un agent
        // approuvé et faisait donc échouer tout le passage du cron.
        const { senderName } = await readEmailAccountStatus();
        const result = await sendTicketReplyEmail({
          ticket,
          clientEmail: ticket.client.email,
          senderName,
          bodyText: rule.emailContent,
          history: [],
        });
        await prisma.message.create({
          data: {
            ticketId: ticket.id,
            content: rule.emailContent,
            authorType: "SYSTEM",
            isPrivate: false,
            emailSent: result.sent,
          },
        });
      }

      revalidatePath(`/tickets/${ticket.id}`);
      processed += 1;
    }

    await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
  }

  if (processed > 0) revalidatePath("/tickets");

  return { rulesEvaluated: rules.length - skipped, rulesSkipped: skipped, ticketsProcessed: processed };
}
