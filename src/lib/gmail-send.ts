import type { gmail_v1 } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";
import { getAuthenticatedGmailClient } from "@/lib/google-oauth";
import {
  renderTicketReplyEmailHtml,
  renderTicketReplyEmailText,
  renderTicketClosureEmailHtml,
  renderTicketClosureEmailText,
  renderAgentApprovalEmailHtml,
  renderAgentApprovalEmailText,
  renderTicketAcknowledgementEmailHtml,
  renderTicketAcknowledgementEmailText,
  type EmailHistoryEntry,
} from "@/lib/email-template";
import { prisma } from "@/lib/prisma";

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// `public/logoIdeeri.jpeg` doit être atteignable par une URL absolue — les
// clients mail chargent les images depuis le web, pas depuis notre serveur.
function getLogoUrl() {
  return process.env.APP_URL ? `${process.env.APP_URL}/logoIdeeri.jpeg` : null;
}

// En-tête Message-ID RFC822 du message qu'on vient d'envoyer : Gmail ne le
// renvoie pas dans la réponse de `send`, il faut relire le message.
async function fetchSentMessageIdHeader(gmail: gmail_v1.Gmail, messageId: string) {
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Message-ID"],
  });
  return (
    data.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? undefined
  );
}

export async function sendTicketReplyEmail({
  ticket,
  clientEmail,
  senderName,
  bodyText,
  history = [],
}: {
  ticket: {
    id: string;
    number: number;
    subject: string;
    gmailThreadId: string | null;
    emailMessageId: string | null;
  };
  clientEmail: string;
  senderName: string;
  bodyText: string;
  history?: EmailHistoryEntry[];
}): Promise<{ sent: boolean; gmailMessageId?: string; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const logoUrl = getLogoUrl();

  const subject = `Re: [#${ticket.number}] ${ticket.subject}`;
  const html = renderTicketReplyEmailHtml({
    ticketNumber: ticket.number,
    senderName,
    bodyText,
    history,
    logoUrl,
  });
  const text = renderTicketReplyEmailText({
    ticketNumber: ticket.number,
    senderName,
    bodyText,
    history,
  });

  try {
    const mail = new MailComposer({
      from: `"${senderName}" <${account.email}>`,
      to: clientEmail,
      subject,
      text,
      html,
      inReplyTo: ticket.emailMessageId ?? undefined,
      references: ticket.emailMessageId ?? undefined,
    });

    const raw = toBase64Url(await mail.compile().build());

    const { data: sent } = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: ticket.gmailThreadId ?? undefined },
    });

    const newMessageIdHeader = sent.id
      ? await fetchSentMessageIdHeader(gmail, sent.id)
      : undefined;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        gmailThreadId: sent.threadId ?? ticket.gmailThreadId,
        emailMessageId: newMessageIdHeader ?? ticket.emailMessageId,
      },
    });

    return { sent: true, gmailMessageId: sent.id ?? undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

/**
 * Accusé de réception envoyé au client dès la création de son ticket depuis un
 * formulaire public. Premier message du fil : pas de threadId ni d'In-Reply-To,
 * mais on enregistre le fil et le Message-ID créés sur le ticket pour que les
 * réponses suivantes de l'équipe (et celles du client) restent dans ce fil.
 */
export async function sendTicketAcknowledgementEmail({
  ticket,
  clientEmail,
  senderName,
  bodyHtml,
}: {
  ticket: {
    id: string;
    number: number;
    subject: string;
  };
  clientEmail: string;
  senderName: string;
  bodyHtml: string;
}): Promise<{ sent: boolean; gmailMessageId?: string; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const logoUrl = getLogoUrl();
  const subject = `[#${ticket.number}] ${ticket.subject}`;
  const html = renderTicketAcknowledgementEmailHtml({
    ticketNumber: ticket.number,
    ticketSubject: ticket.subject,
    senderName,
    bodyHtml,
    logoUrl,
  });
  const text = renderTicketAcknowledgementEmailText({
    ticketNumber: ticket.number,
    ticketSubject: ticket.subject,
    senderName,
    bodyHtml,
  });

  try {
    const mail = new MailComposer({
      from: `"${senderName}" <${account.email}>`,
      to: clientEmail,
      subject,
      text,
      html,
    });

    const raw = toBase64Url(await mail.compile().build());
    const { data: sent } = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const messageIdHeader = sent.id ? await fetchSentMessageIdHeader(gmail, sent.id) : undefined;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        gmailThreadId: sent.threadId ?? undefined,
        emailMessageId: messageIdHeader ?? undefined,
      },
    });

    return { sent: true, gmailMessageId: sent.id ?? undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

/**
 * Notifie un nouvel agent que son accès vient d'être validé. Hors fil de
 * discussion d'un ticket : pas de threadId ni d'en-tête In-Reply-To.
 */
export async function sendAgentApprovalEmail({
  to,
  agentName,
}: {
  to: string;
  agentName: string;
}): Promise<{ sent: boolean; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const appUrl = process.env.APP_URL ?? null;
  const html = renderAgentApprovalEmailHtml({ agentName, appUrl, logoUrl: getLogoUrl() });
  const text = renderAgentApprovalEmailText({ agentName, appUrl });

  try {
    const mail = new MailComposer({
      from: `"Ideeri Desk" <${account.email}>`,
      to,
      subject: "Votre accès à Ideeri Desk est validé",
      text,
      html,
    });

    const raw = toBase64Url(await mail.compile().build());
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

export async function sendTicketClosureEmail({
  ticket,
  clientEmail,
  senderName,
  bodyHtml,
}: {
  ticket: {
    id: string;
    number: number;
    subject: string;
    gmailThreadId: string | null;
    emailMessageId: string | null;
  };
  clientEmail: string;
  senderName: string;
  bodyHtml: string;
}): Promise<{ sent: boolean; gmailMessageId?: string; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const logoUrl = getLogoUrl();
  const subject = `Re: [#${ticket.number}] ${ticket.subject} — Ticket clôturé`;
  const html = renderTicketClosureEmailHtml({ ticketNumber: ticket.number, senderName, bodyHtml, logoUrl });
  const text = renderTicketClosureEmailText({ ticketNumber: ticket.number, senderName, bodyHtml });

  try {
    const mail = new MailComposer({
      from: `"${senderName}" <${account.email}>`,
      to: clientEmail,
      subject,
      text,
      html,
      inReplyTo: ticket.emailMessageId ?? undefined,
      references: ticket.emailMessageId ?? undefined,
    });

    const raw = toBase64Url(await mail.compile().build());

    const { data: sent } = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: ticket.gmailThreadId ?? undefined },
    });

    return { sent: true, gmailMessageId: sent.id ?? undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}
