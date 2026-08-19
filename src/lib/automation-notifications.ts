import { prisma } from "@/lib/prisma";
import { sendAutomationAlertEmail } from "@/lib/gmail-send";

export type NotifiableGroup = {
  name: string;
  members: { id: string; name: string; email: string; notifyOnAutomation: boolean }[];
};

/**
 * Chargé UNE fois par règle, pas par ticket : une règle qui rattrape 50 tickets
 * relisait sinon 50 fois le même groupe.
 */
export async function loadNotifiableGroup(groupId: string): Promise<NotifiableGroup | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      members: {
        // Un compte désactivé, non approuvé ou anonymisé ne consulte rien.
        where: { isActive: true, approvalStatus: "APPROVED", anonymizedAt: null },
        select: { id: true, name: true, email: true, notifyOnAutomation: true },
      },
    },
  });

  if (!group) return null;
  // Réglage à corriger, pas un cas normal : sans cette trace, la règle semble
  // fonctionner alors que personne n'est prévenu.
  if (group.members.length === 0) {
    console.error(`[automations] groupe « ${group.name} » sans membre joignable : personne prévenu.`);
    return null;
  }
  return group;
}

// Le ticket reste NON ASSIGNÉ : une escalade confiée à une équipe n'a personne à
// désigner, elle a des gens à alerter.
//
// Ne lève jamais : le statut est déjà changé quand on arrive ici, un souci
// d'email ne doit pas faire échouer le passage du cron.
export async function notifyGroupOfAutomation({
  group,
  ruleName,
  ticket,
}: {
  group: NotifiableGroup;
  ruleName: string;
  ticket: {
    id: string;
    number: number;
    subject: string;
    statusName: string;
    priorityName: string;
    clientLabel: string;
  };
}): Promise<void> {
  try {
    // La cloche part toujours ; seul l'email se coupe depuis la fiche de l'agent.
    // Même partage que pour les assignations : la cloche se consulte dans
    // l'application, l'email va chercher quelqu'un qui n'y est pas.
    await prisma.notification.createMany({
      data: group.members.map((member) => ({
        type: "AUTOMATION" as const,
        excerpt: `Ticket #${ticket.number} passé en ${ticket.statusName} — ${ruleName}`,
        recipientId: member.id,
        ticketId: ticket.id,
      })),
    });

    const byEmail = group.members.filter((member) => member.notifyOnAutomation);
    await Promise.all(
      byEmail.map(async (member) => {
        try {
          const result = await sendAutomationAlertEmail({
            to: member.email,
            recipientName: member.name,
            ruleName,
            groupName: group.name,
            ticket,
          });
          if (!result.sent) {
            console.error(`[automations] email non envoyé à ${member.id} : ${result.error}`);
          }
        } catch (error) {
          console.error(`[automations] email non envoyé à ${member.id}`, error);
        }
      })
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    console.error(`[automations] groupe non prévenu pour le ticket ${ticket.number} : ${reason}`);
  }
}
