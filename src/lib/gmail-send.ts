import MailComposer from "nodemailer/lib/mail-composer";
import { getAuthenticatedGmailClient } from "@/lib/google-oauth";
import {
  renderTicketReplyEmailHtml,
  renderTicketReplyEmailText,
  renderTicketClosureEmailHtml,
  renderTicketClosureEmailText,
  renderAgentApprovalEmailHtml,
  renderAgentApprovalEmailText,
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

    let newMessageIdHeader: string | undefined;
    if (sent.id) {
      const { data: fullSent } = await gmail.users.messages.get({
        userId: "me",
        id: sent.id,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });
      newMessageIdHeader = fullSent.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === "message-id"
      )?.value ?? undefined;
    }

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
