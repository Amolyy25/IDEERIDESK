import { prisma } from "@/lib/prisma";
import { sendNewQueueTicketEmail } from "@/lib/gmail-send";
import { excerpt } from "@/lib/utils";

/** Longueur de l'extrait de la demande repris dans l'email — pas la demande entière. */
const EXCERPT_LENGTH = 400;

function toExcerpt(content: string) {
  return excerpt(content, EXCERPT_LENGTH) || "(message vide)";
}

/**
 * Prévient les agents dont la file vient de recevoir un ticket.
 *
 * « Sa file » a une définition précise dans cette application, déjà utilisée par
 * la liste de tickets : les produits couverts par les groupes auxquels l'agent
 * appartient. On s'y tient — un email qui prévient d'autre chose que ce que
 * l'agent voit en ouvrant /tickets serait un troisième périmètre à comprendre.
 *
 * TICKET SANS PRODUIT : personne n'est prévenu, et c'est un choix. Un ticket
 * qu'aucun groupe ne couvre n'est la file de personne ; écrire à toute l'équipe
 * à sa place transformerait chaque email entrant non classé — le cas le plus
 * courant — en message à tous les agents, ce qui est la façon la plus sûre de
 * faire filtrer l'expéditeur par tout le monde. Ces tickets restent visibles
 * dans l'onglet « Non assignés », qui est fait pour ça.
 *
 * Best-effort et sans exception : le ticket est déjà créé et le client attend
 * une réponse, un souci d'email ne doit rien faire échouer.
 */
export async function notifyQueueOnNewTicket({
  ticketId,
  actorId = null,
}: {
  ticketId: string;
  /** Agent à l'origine de la création, exclu des destinataires. Nul pour un dépôt public. */
  actorId?: string | null;
}): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        categoryId: true,
        category: { select: { name: true } },
        priority: { select: { name: true } },
        client: { select: { name: true, email: true } },
      },
    });
    if (!ticket?.categoryId || !ticket.category) return;

    const recipients = await prisma.agent.findMany({
      where: {
        isActive: true,
        approvalStatus: "APPROVED",
        notifyOnNewTicket: true,
        anonymizedAt: null,
        id: actorId ? { not: actorId } : undefined,
        // Le lien groupe → produits est la seule définition de « sa file ».
        groups: { some: { products: { some: { id: ticket.categoryId } } } },
      },
      select: { id: true, name: true, email: true },
    });
    if (recipients.length === 0) return;

    const payload = {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      productName: ticket.category.name,
      priorityName: ticket.priority.name,
      // Le nom seul : l'adresse du client n'apporte rien à la décision d'ouvrir
      // ou non, et cet email part à plusieurs personnes.
      clientLabel: ticket.client?.name ?? "Client inconnu",
      description: toExcerpt(ticket.description),
    };

    await Promise.all(
      recipients.map(async (agent) => {
        try {
          const result = await sendNewQueueTicketEmail({
            to: agent.email,
            recipientName: agent.name,
            ticket: payload,
          });
          if (!result.sent) {
            console.error(`[file] email non envoyé à ${agent.id} : ${result.error}`);
          }
        } catch (error) {
          console.error(`[file] email non envoyé à ${agent.id}`, error);
        }
      })
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    console.error(`[file] notification non envoyée pour le ticket ${ticketId} : ${reason}`);
  }
}
