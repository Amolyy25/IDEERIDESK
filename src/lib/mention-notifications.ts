import { prisma } from "@/lib/prisma";
import { findMentionedAgents } from "@/lib/mentions";
import { sendAgentMentionEmail } from "@/lib/gmail-send";
import { excerpt } from "@/lib/utils";

/** Longueur de l'extrait figé dans la cloche — une ligne de liste, pas la note entière. */
const EXCERPT_LENGTH = 200;

/**
 * Traite les mentions « @Prénom Nom » d'une note interne : une notification en
 * base pour la cloche du dashboard, et un email pour chaque agent cité.
 *
 * Réservé aux notes internes (`isPrivate`) — appelé uniquement depuis cette
 * branche : une réponse publique part au client, mentionner un collègue dedans
 * n'aurait aucun sens et exposerait un nom interne.
 *
 * Les agents cités sont relus depuis la base à partir du texte de la note :
 * l'appelant ne transmet aucune liste d'identifiants, donc rien à revalider.
 * L'auteur est exclu (se pinger soi-même ne notifie personne) et l'envoi
 * d'email est « best effort » : un échec Gmail ne doit pas faire échouer
 * l'enregistrement de la note.
 */
export async function notifyMentionedAgents({
  ticketId,
  messageId,
  actorId,
  content,
}: {
  ticketId: string;
  messageId: string;
  actorId: string;
  content: string;
}): Promise<{ mentionedNames: string[] }> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    select: { id: true, name: true, email: true },
  });

  const mentioned = findMentionedAgents(content, agents).filter((agent) => agent.id !== actorId);
  if (mentioned.length === 0) {
    return { mentionedNames: [] };
  }

  const [ticket, actor] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, number: true, subject: true },
    }),
    prisma.agent.findUnique({ where: { id: actorId }, select: { name: true } }),
  ]);
  if (!ticket) {
    return { mentionedNames: [] };
  }

  const noteExcerpt = excerpt(content, EXCERPT_LENGTH);
  await prisma.notification.createMany({
    data: mentioned.map((agent) => ({
      type: "MENTION" as const,
      excerpt: noteExcerpt,
      recipientId: agent.id,
      actorId,
      ticketId,
      messageId,
    })),
  });

  const actorName = actor?.name ?? "Un agent";
  await Promise.all(
    mentioned.map(async (agent) => {
      try {
        const result = await sendAgentMentionEmail({
          to: agent.email,
          recipientName: agent.name,
          actorName,
          ticket,
          noteContent: content,
        });
        if (!result.sent) {
          console.error(`[mentions] email non envoyé à ${agent.id} : ${result.error}`);
        }
      } catch (error) {
        console.error(`[mentions] email non envoyé à ${agent.id}`, error);
      }
    })
  );

  return { mentionedNames: mentioned.map((agent) => agent.name) };
}
