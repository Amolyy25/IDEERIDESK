import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { getEmailAccountStatus } from "@/lib/actions/email-account";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Applies every active automation rule once. Meant to be called on a
 * schedule (see `/api/cron/automations`) — idempotent by construction:
 * once a rule moves a ticket out of its trigger status, that ticket no
 * longer matches the rule on the next run, so there's no separate
 * "already processed" bookkeeping to maintain.
 */
export async function runAutomations() {
  const rules = await prisma.automationRule.findMany({
    where: { isActive: true },
    include: { actionStatus: true },
  });

  let processed = 0;

  for (const rule of rules) {
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
        const { senderName } = await getEmailAccountStatus();
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

  return { rulesEvaluated: rules.length, ticketsProcessed: processed };
}
