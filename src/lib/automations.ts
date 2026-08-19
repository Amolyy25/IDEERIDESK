import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import { slaFieldsForStatusChange } from "@/lib/sla-store";
import { ticketsMatchingRule } from "@/lib/automation-match";
import { loadNotifiableGroup, notifyGroupOfAutomation } from "@/lib/automation-notifications";

// Ce dont l'envoi, l'alerte de groupe et le fil ont besoin — rien de plus. Le
// dossier client complet (téléphone, société) n'entre pas dans ce passage.
const ticketSelect = {
  id: true,
  number: true,
  subject: true,
  gmailThreadId: true,
  emailMessageId: true,
  client: { select: { name: true, email: true } },
  priority: { select: { name: true } },
} as const;

/** Applique une fois chaque règle active. Appelé par `/api/cron/automations`. */
export async function runAutomations() {
  const rules = await prisma.automationRule.findMany({
    where: { isActive: true },
    include: { actionStatus: true, actionPriority: true },
  });

  let processed = 0;
  let skipped = 0;

  // Le nom d'expéditeur coûte trois requêtes : il est lu au premier email du
  // passage, pas à chaque ticket.
  let senderName: string | null = null;
  async function resolveSenderName() {
    // Lecture sans garde d'accès : `runAutomations` tourne aussi depuis
    // /api/cron/automations, authentifié par un secret et non par une session
    // d'agent. `getEmailAccountStatus` exige un agent approuvé et faisait donc
    // échouer tout le passage du cron.
    senderName ??= (await readEmailAccountStatus()).senderName;
    return senderName;
  }

  for (const rule of rules) {
    // Une règle sort ses tickets de son propre statut déclencheur : c'est ce qui
    // la rend idempotente sans registre de « déjà traité ». Statut d'arrivée
    // identique = tickets re-traités à chaque passage, donc note et email en
    // boucle. Refusé par `ruleSchema`, mais pas pour les règles antérieures.
    if (rule.actionStatusId === rule.triggerStatusId) {
      skipped += 1;
      console.error(
        `[automations] règle « ${rule.name} » ignorée : statut d'arrivée identique au statut ` +
          `déclencheur, elle se rejouerait sans fin. Corrigez-la dans Paramètres > Règles automatiques.`
      );
      continue;
    }

    const tickets = await prisma.ticket.findMany({
      where: ticketsMatchingRule(rule),
      select: ticketSelect,
    });
    if (tickets.length === 0) {
      await touchRule(rule.id);
      continue;
    }

    const group = rule.actionNotifyGroupId
      ? await loadNotifiableGroup(rule.actionNotifyGroupId)
      : null;

    for (const ticket of tickets) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          statusId: rule.actionStatusId,
          closedAt: rule.actionStatus.isClosed ? new Date() : null,
          // Clé absente = volet non touché. Prisma interpréterait un `null`
          // explicite comme « vider le champ ».
          ...(rule.actionPriorityId ? { priorityId: rule.actionPriorityId } : {}),
          ...(rule.actionAssigneeId ? { assigneeId: rule.actionAssigneeId } : {}),
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
        const result = await sendTicketReplyEmail({
          ticket,
          clientEmail: ticket.client.email,
          senderName: await resolveSenderName(),
          bodyText: rule.emailContent,
          bodyHtml: rule.emailHtml,
          history: [],
        });
        await prisma.message.create({
          data: {
            ticketId: ticket.id,
            // Le fil affiche la mise en forme quand elle existe : le message
            // enregistré doit être celui que le client a reçu.
            content: rule.emailHtml || rule.emailContent,
            authorType: "SYSTEM",
            isPrivate: false,
            emailSent: result.sent,
          },
        });
      }

      if (group) {
        await notifyGroupOfAutomation({
          group,
          ruleName: rule.name,
          ticket: {
            id: ticket.id,
            number: ticket.number,
            subject: ticket.subject,
            statusName: rule.actionStatus.name,
            // La priorité posée par la règle, sinon celle du ticket : c'est
            // l'état d'arrivée qu'on annonce, pas celui de départ.
            priorityName: rule.actionPriority?.name ?? ticket.priority.name,
            // Le nom seul, jamais l'adresse : cet email part à tout un groupe.
            clientLabel: ticket.client?.name ?? "Client inconnu",
          },
        });
      }

      revalidatePath(`/tickets/${ticket.id}`);
      processed += 1;
    }

    await touchRule(rule.id);
  }

  if (processed > 0) revalidatePath("/tickets");

  return {
    rulesEvaluated: rules.length - skipped,
    rulesSkipped: skipped,
    ticketsProcessed: processed,
  };
}

function touchRule(id: string) {
  return prisma.automationRule.update({ where: { id }, data: { lastRunAt: new Date() } });
}
