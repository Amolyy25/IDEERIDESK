/**
 * Une réponse publique, de sa mise en forme jusqu'à son envoi : le corps
 * enregistré, l'email au client, sa répercussion sur les tickets fusionnés.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendTicketReplyEmail } from "@/lib/gmail-send";
import { readEmailAccountStatus } from "@/lib/email-account";
import type { EmailHistoryEntry } from "@/lib/email-template";
import { sanitizeReplyHtml } from "@/lib/sanitize-html";
import { htmlToText } from "@/lib/html-to-text";
import { resolveSignatureHtmlForAgent } from "@/lib/signature-store";
import { markSlaFirstResponse } from "@/lib/sla-store";
import { getMergedRecipients } from "@/lib/ticket-merge";

const EMAIL_HISTORY_LIMIT = 10;

// Les deux formes d'une réponse : l'email est multipart, un client mail qui refuse
// le HTML doit recevoir le texte. `html` nul = écrit avant l'éditeur riche.
export type ReplyBody = { content: string; html: string | null };

export type ReplyOutcome = {
  emailSent: boolean;
  emailSkippedReason: string | null;
  /** Nombre de tickets fusionnés dont le client a aussi reçu la réponse. */
  alsoSentTo: number;
};

// Le texte enregistré vient du HTML ASSAINI, pas de celui du navigateur : `content`
// alimente recherche, export CSV, dossier RGPD et boîtes sans HTML, il ne peut pas
// diverger du filtrage. Un HTML entièrement refusé retombe sur le texte brut.
export function resolveReplyBody(data: { content: string; contentHtml?: string }): ReplyBody {
  if (!data.contentHtml) return { content: data.content, html: null };

  const html = sanitizeReplyHtml(data.contentHtml);
  const text = htmlToText(html);
  if (!text) return { content: data.content, html: null };

  return { content: text, html };
}

// Les réponses agent partent toutes au nom de la boîte partagée : l'historique
// reprend cette convention plutôt que de révéler quel agent a écrit quoi.
async function buildEmailHistory({
  ticketId,
  excludeMessageId,
  clientName,
  senderName,
}: {
  ticketId: string;
  excludeMessageId: string | null;
  clientName: string | null;
  senderName: string;
}): Promise<EmailHistoryEntry[]> {
  const previousMessages = await prisma.message.findMany({
    where: {
      ticketId,
      isPrivate: false,
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: EMAIL_HISTORY_LIMIT,
  });

  return previousMessages
    .map((m) => ({
      authorLabel: m.authorType === "AGENT" ? senderName : clientName ?? "Client",
      content: m.content,
      createdAt: m.createdAt,
    }))
    .reverse();
}

// Partagée par les deux chemins d'une réponse publique : l'envoi direct et le
// relâchement d'une réponse retenue en validation.
//
// `agentId` est l'AUTEUR, pas l'expéditeur : c'est sa signature qui part en bas de
// l'email, même quand un collègue habilité a relâché la réponse.
export async function sendApprovedTicketReply(
  ticketId: string,
  messageId: string,
  body: ReplyBody,
  agentId: string | null,
): Promise<ReplyOutcome> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { client: true },
  });
  if (!ticket) {
    return { emailSent: false, emailSkippedReason: "Ticket introuvable.", alsoSentTo: 0 };
  }

  // Ici et pas à la création du message : les deux chemins d'une réponse publique
  // passent par cette fonction, et une réponse retenue en validation n'a rien
  // adressé au client — son horloge doit continuer de tourner.
  //
  // Indépendant du succès de l'envoi : un échec Gmail est un incident technique,
  // tracé comme tel dans le fil, pas un manquement au délai.
  await markSlaFirstResponse(ticketId);

  const { senderName } = await readEmailAccountStatus();
  const signatureHtml = await resolveSignatureHtmlForAgent(agentId);

  let emailSent = false;
  let emailSkippedReason: string | null = "Aucun client associé à ce ticket.";

  if (ticket.client?.email) {
    const result = await sendTicketReplyEmail({
      ticket,
      clientEmail: ticket.client.email,
      senderName,
      bodyText: body.content,
      bodyHtml: body.html,
      history: await buildEmailHistory({
        ticketId,
        excludeMessageId: messageId,
        clientName: ticket.client.name,
        senderName,
      }),
      signatureHtml,
    });

    emailSent = result.sent;
    emailSkippedReason = result.sent ? null : result.error ?? null;

    if (result.sent) {
      await prisma.message.update({
        where: { id: messageId },
        data: { emailSent: true, gmailMessageId: result.gmailMessageId },
      });
    }
  }

  const alsoSentTo = await deliverToMergedTickets({
    targetTicketId: ticketId,
    body,
    agentId,
    senderName,
    signatureHtml,
    alreadyServed: ticket.client?.email ? [ticket.client.email] : [],
  });

  revalidatePath(`/tickets/${ticketId}`);
  return { emailSent, emailSkippedReason, alsoSentTo };
}

// Un email par ticket fusionné, dans sa propre conversation et jamais un Cc
// commun : deux clients qui ont écrit séparément n'ont pas accepté que leur
// adresse soit montrée à l'autre. La copie déposée dans chaque fil évite que ces
// dossiers montrent une demande restée sans réponse.
//
// Ne lève jamais : un échec sur un doublon ne doit pas faire échouer la réponse
// principale, déjà partie.
async function deliverToMergedTickets({
  targetTicketId,
  body,
  agentId,
  senderName,
  signatureHtml,
  alreadyServed,
}: {
  targetTicketId: string;
  body: ReplyBody;
  agentId: string | null;
  senderName: string;
  signatureHtml: string | null;
  alreadyServed: string[];
}): Promise<number> {
  const recipients = await getMergedRecipients(targetTicketId, alreadyServed);
  let delivered = 0;

  for (const recipient of recipients) {
    const copy = await prisma.message.create({
      data: {
        ticketId: recipient.ticketId,
        content: body.content,
        contentHtml: body.html,
        authorType: "AGENT",
        agentId,
        isPrivate: false,
      },
    });

    const result = await sendTicketReplyEmail({
      ticket: {
        id: recipient.ticketId,
        number: recipient.ticketNumber,
        subject: recipient.subject,
        gmailThreadId: recipient.gmailThreadId,
        emailMessageId: recipient.emailMessageId,
      },
      clientEmail: recipient.clientEmail,
      senderName,
      bodyText: body.content,
      bodyHtml: body.html,
      history: await buildEmailHistory({
        ticketId: recipient.ticketId,
        excludeMessageId: copy.id,
        clientName: recipient.clientName,
        senderName,
      }),
      signatureHtml,
    });

    if (result.sent) {
      delivered += 1;
      await prisma.message.update({
        where: { id: copy.id },
        data: { emailSent: true, gmailMessageId: result.gmailMessageId },
      });
    } else {
      await prisma.message.create({
        data: {
          ticketId: recipient.ticketId,
          content: `Échec de l'envoi de la réponse au client de ce ticket fusionné : ${
            result.error ?? "erreur inconnue"
          }.`,
          authorType: "SYSTEM",
          isPrivate: true,
        },
      });
    }
    revalidatePath(`/tickets/${recipient.ticketId}`);
  }

  return delivered;
}

// Le sort de la réponse, jamais son contenu. L'échec d'envoi est le fait à tracer
// en priorité : c'est lui qui explique un client sans nouvelles alors que le fil
// montre une réponse.
export function replySummary({ emailSent, emailSkippedReason, alsoSentTo }: ReplyOutcome) {
  const plural = alsoSentTo > 1 ? "s" : "";

  const parts = [
    emailSent
      ? "Réponse publique envoyée au client par email."
      : `Réponse publique enregistrée, email non envoyé : ${
          emailSkippedReason ?? "raison inconnue"
        }`,
  ];
  if (alsoSentTo > 0) {
    parts.push(`Également envoyée aux clients de ${alsoSentTo} ticket${plural} fusionné${plural}.`);
  }
  return parts.join(" ");
}
