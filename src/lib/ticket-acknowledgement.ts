import { prisma } from "@/lib/prisma";
import { sendTicketAcknowledgementEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";

export type AcknowledgementResult = {
  sent: boolean;
  /** Raison pour laquelle rien n'a été envoyé (modèle absent, Gmail hors ligne…). */
  skippedReason: string | null;
};

/**
 * Envoie l'accusé de réception au client d'un ticket fraîchement créé, quel
 * qu'en soit le canal : formulaire public (widget, portail) ou email entrant.
 * Best-effort : ne lève jamais, pour qu'un souci d'email ne fasse pas échouer la
 * création du ticket côté client.
 */
export async function sendTicketAcknowledgement(ticketId: string): Promise<AcknowledgementResult> {
  try {
    const [template, ticket] = await Promise.all([
      prisma.ticketAcknowledgementTemplate.findFirst(),
      prisma.ticket.findUnique({ where: { id: ticketId }, include: { client: true } }),
    ]);

    if (!template?.bodyHtml) {
      return { sent: false, skippedReason: "Aucun modèle d'accusé de réception configuré." };
    }
    if (!ticket) {
      return { sent: false, skippedReason: "Ticket introuvable." };
    }
    if (!ticket.client?.email) {
      return { sent: false, skippedReason: "Aucune adresse email connue pour ce client." };
    }

    // `readEmailAccountStatus`, PAS l'action `getEmailAccountStatus` : cette
    // fonction tourne aussi sans appelant connecté (dépôt d'un ticket depuis le
    // widget ou le portail, email entrant). L'action exige un agent approuvé et
    // levait donc « Non autorisé. » à chaque dépôt public — erreur avalée par le
    // catch plus bas, si bien qu'aucun accusé de réception ne partait jamais
    // d'un formulaire public.
    const { senderName } = await readEmailAccountStatus();
    const result = await sendTicketAcknowledgementEmail({
      ticket,
      clientEmail: ticket.client.email,
      senderName,
      bodyHtml: template.bodyHtml,
    });

    // Trace dans le fil du ticket, comme pour l'email de clôture : un agent qui
    // ouvre la fiche voit si le client a été prévenu, ou pourquoi non.
    await prisma.message.create({
      data: {
        ticketId,
        content: result.sent
          ? "Accusé de réception envoyé au client."
          : `Échec de l'envoi de l'accusé de réception : ${result.error ?? "erreur inconnue"}.`,
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });

    return { sent: result.sent, skippedReason: result.sent ? null : result.error ?? null };
  } catch (error) {
    return {
      sent: false,
      skippedReason: error instanceof Error ? error.message : "Erreur inconnue.",
    };
  }
}
