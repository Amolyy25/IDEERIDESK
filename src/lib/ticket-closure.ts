/**
 * Ce qui est annoncé au client quand un ticket se ferme : l'email de clôture, sa
 * répercussion sur les tickets fusionnés, et la trace laissée dans le fil.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendTicketClosureEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import { getMergedRecipients } from "@/lib/ticket-merge";

/** Ticket relu avant sa clôture, avec le client à qui l'annoncer. */
type ClosingTicket = Prisma.TicketGetPayload<{ include: { client: true } }>;

export type ClosureOutcome = {
  emailSent: boolean;
  emailSkippedReason: string | null;
  /** Nombre de tickets fusionnés dont le client a aussi été prévenu. */
  alsoSentTo: number;
};

const NOTHING_SENT: ClosureOutcome = {
  emailSent: false,
  emailSkippedReason: null,
  alsoSentTo: 0,
};

/** Note interne d'échec ou de succès d'envoi, déposée dans le fil concerné. */
function noteInThread(ticketId: string, content: string) {
  return prisma.message.create({
    data: { ticketId, content, authorType: "SYSTEM", isPrivate: true },
  });
}

function closureFailureNote(error: string | undefined) {
  return `Échec de l'envoi de l'email de clôture : ${error ?? "erreur inconnue"}.`;
}

// Sans modèle de clôture configuré, rien ne part : pas de spam tant que l'équipe
// n'a pas rédigé son message.
export async function announceClosure(
  ticket: ClosingTicket,
  { silent }: { silent: boolean },
): Promise<ClosureOutcome> {
  if (silent) {
    // Dans le fil et pas seulement au journal : c'est là que le prochain agent
    // cherchera pourquoi ce dossier est clos sans qu'aucune réponse n'en soit
    // partie. Sinon l'absence d'email se lit comme un oubli ou une panne.
    await noteInThread(
      ticket.id,
      "Clôture silencieuse : le ticket a été fermé sans email de clôture, à la demande de l'agent. Le client n'a pas été prévenu.",
    );
    return NOTHING_SENT;
  }

  const template = await prisma.ticketClosureTemplate.findFirst();
  if (!template?.bodyHtml) return NOTHING_SENT;

  const { senderName } = await readEmailAccountStatus();
  let emailSent = false;
  let emailSkippedReason: string | null = null;

  if (ticket.client?.email) {
    const result = await sendTicketClosureEmail({
      ticket,
      clientEmail: ticket.client.email,
      senderName,
      bodyHtml: template.bodyHtml,
    });
    emailSent = result.sent;
    emailSkippedReason = result.sent ? null : result.error ?? null;

    await noteInThread(
      ticket.id,
      result.sent ? "Email de clôture envoyé au client." : closureFailureNote(result.error),
    );
  }

  const alsoSentTo = await announceToMergedTickets({
    ticket,
    senderName,
    bodyHtml: template.bodyHtml,
  });

  return { emailSent, emailSkippedReason, alsoSentTo };
}

// Un email par ticket fusionné, dans sa propre conversation et jamais un Cc
// commun : deux clients qui ont écrit séparément n'ont pas accepté que leur
// adresse soit montrée à l'autre.
async function announceToMergedTickets({
  ticket,
  senderName,
  bodyHtml,
}: {
  ticket: ClosingTicket;
  senderName: string;
  bodyHtml: string;
}): Promise<number> {
  const alreadyServed = ticket.client?.email ? [ticket.client.email] : [];
  let delivered = 0;

  for (const recipient of await getMergedRecipients(ticket.id, alreadyServed)) {
    const result = await sendTicketClosureEmail({
      ticket: {
        id: recipient.ticketId,
        number: recipient.ticketNumber,
        subject: recipient.subject,
        gmailThreadId: recipient.gmailThreadId,
        emailMessageId: recipient.emailMessageId,
      },
      clientEmail: recipient.clientEmail,
      senderName,
      bodyHtml,
    });
    if (result.sent) delivered += 1;

    await noteInThread(
      recipient.ticketId,
      result.sent
        ? `Email de clôture envoyé au client, suite à la clôture du ticket #${ticket.number}.`
        : closureFailureNote(result.error),
    );
    revalidatePath(`/tickets/${recipient.ticketId}`);
  }

  return delivered;
}

/** Ce que le journal retient d'une clôture : qui a été prévenu, et qui ne l'a pas été. */
export function closureSummary({
  statusName,
  silent,
  emailSent,
  emailSkippedReason,
  alsoSentTo,
}: ClosureOutcome & { statusName: string; silent: boolean }) {
  const plural = alsoSentTo > 1 ? "s" : "";

  return [
    `Statut passé à « ${statusName} ».`,
    // Le fait à tracer en priorité : que personne n'a été prévenu, et que
    // c'était voulu. C'est ce qui répond, des mois plus tard, au client qui
    // affirme n'avoir jamais eu de nouvelles.
    silent
      ? "Clôture silencieuse demandée par l'agent : aucun email envoyé, ni au client, ni aux clients des tickets fusionnés."
      : null,
    emailSent ? "Email de clôture envoyé au client." : null,
    emailSkippedReason ? `Email de clôture non envoyé : ${emailSkippedReason}` : null,
    alsoSentTo > 0
      ? `Clôture répercutée sur ${alsoSentTo} ticket${plural} fusionné${plural}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
