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
  renderAgentMentionEmailHtml,
  renderAgentMentionEmailText,
  renderTicketAcknowledgementEmailHtml,
  renderTicketAcknowledgementEmailText,
  renderTicketAssignedEmailHtml,
  renderTicketAssignedEmailText,
  type EmailHistoryEntry,
} from "@/lib/email-template";
import { getEmailLayoutHtml } from "@/lib/email-layout-store";
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
  signatureHtml,
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
  /** Signature de l'agent auteur de la réponse, résolue par l'appelant. */
  signatureHtml?: string | null;
}): Promise<{ sent: boolean; gmailMessageId?: string; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const logoUrl = getLogoUrl();

  const subject = `Re: [#${ticket.number}] ${ticket.subject}`;
  const html = renderTicketReplyEmailHtml({
    layoutHtml: await getEmailLayoutHtml(),
    ticketNumber: ticket.number,
    senderName,
    bodyText,
    history,
    signatureHtml,
    logoUrl,
  });
  const text = renderTicketReplyEmailText({
    ticketNumber: ticket.number,
    senderName,
    bodyText,
    history,
    signatureHtml,
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
 * Accusé de réception envoyé au client dès la création de son ticket.
 *
 * Deux cas, distingués par le fil déjà porté par le ticket :
 *
 * - ticket déposé depuis un formulaire public (widget, portail) : aucun fil
 *   n'existe, l'accusé ouvre la conversation ;
 * - ticket né d'un email entrant : l'accusé part **dans le fil du client**
 *   (threadId + In-Reply-To), pour qu'il le reçoive comme une réponse à son
 *   propre message. Indispensable, pas cosmétique : envoyé hors fil, Gmail
 *   créerait une seconde conversation, `Ticket.gmailThreadId` basculerait
 *   dessus, et la prochaine réponse du client — écrite dans son fil d'origine,
 *   sans le tag [#N] dans le sujet — ne serait plus rattachée à son ticket.
 *
 * Dans les deux cas, le fil et le Message-ID retenus sont enregistrés sur le
 * ticket pour que les tours suivants y restent.
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
    gmailThreadId?: string | null;
    emailMessageId?: string | null;
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

  // « Re: » seulement quand l'accusé prolonge une conversation existante : en
  // tête de fil, ce préfixe répondrait à un message que le client n'a pas écrit.
  let subject = `[#${ticket.number}] ${ticket.subject}`;
  if (ticket.gmailThreadId) {
    subject = `Re: ${subject}`;
  }

  const html = renderTicketAcknowledgementEmailHtml({
    layoutHtml: await getEmailLayoutHtml(),
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
      inReplyTo: ticket.emailMessageId ?? undefined,
      references: ticket.emailMessageId ?? undefined,
    });

    const raw = toBase64Url(await mail.compile().build());
    const { data: sent } = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: ticket.gmailThreadId ?? undefined },
    });

    const messageIdHeader = sent.id ? await fetchSentMessageIdHeader(gmail, sent.id) : undefined;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        gmailThreadId: sent.threadId ?? ticket.gmailThreadId ?? undefined,
        emailMessageId: messageIdHeader ?? ticket.emailMessageId ?? undefined,
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
  const html = renderAgentApprovalEmailHtml({
    layoutHtml: await getEmailLayoutHtml(),
    agentName,
    appUrl,
    logoUrl: getLogoUrl(),
  });
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

/**
 * Prévient un agent qu'un collègue l'a mentionné en @ dans une note interne.
 * Hors fil de discussion du client : pas de threadId ni d'In-Reply-To, la note
 * ne doit jamais atterrir dans la conversation visible du client.
 */
export async function sendAgentMentionEmail({
  to,
  recipientName,
  actorName,
  ticket,
  noteContent,
}: {
  to: string;
  recipientName: string;
  actorName: string;
  ticket: { id: string; number: number; subject: string };
  noteContent: string;
}): Promise<{ sent: boolean; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const ticketUrl = process.env.APP_URL ? `${process.env.APP_URL}/tickets/${ticket.id}` : null;
  const payload = {
    recipientName,
    actorName,
    ticketNumber: ticket.number,
    ticketSubject: ticket.subject,
    noteContent,
    ticketUrl,
  };
  const layoutHtml = await getEmailLayoutHtml();

  try {
    const mail = new MailComposer({
      from: `"Ideeri Desk" <${account.email}>`,
      to,
      // Le nom vient du profil Google de l'agent : aplati sur une ligne avant
      // d'entrer dans un en-tête, pour ne pas dépendre du nettoyage de la
      // librairie d'encodage (injection d'en-tête).
      subject: `${actorName.replace(/[\r\n]+/g, " ")} vous a mentionné · Ticket #${ticket.number}`,
      text: renderAgentMentionEmailText(payload),
      html: renderAgentMentionEmailHtml({ ...payload, layoutHtml, logoUrl: getLogoUrl() }),
    });

    const raw = toBase64Url(await mail.compile().build());
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

/**
 * Prévient un agent qu'un ticket vient de lui être confié. Email interne, pas
 * de fil client : ni `threadId` ni `In-Reply-To`, comme l'email de mention.
 */
export async function sendTicketAssignedEmail({
  to,
  recipientName,
  actorName,
  ticket,
}: {
  to: string;
  recipientName: string;
  actorName: string;
  ticket: {
    id: string;
    number: number;
    subject: string;
    statusName: string;
    priorityName: string;
  };
}): Promise<{ sent: boolean; error?: string }> {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { sent: false, error: "Gmail n'est pas connecté." };
  }
  const { gmail, account } = authenticated;

  const ticketUrl = process.env.APP_URL ? `${process.env.APP_URL}/tickets/${ticket.id}` : null;
  const payload = {
    recipientName,
    actorName,
    ticketNumber: ticket.number,
    ticketSubject: ticket.subject,
    statusName: ticket.statusName,
    priorityName: ticket.priorityName,
    ticketUrl,
  };
  const layoutHtml = await getEmailLayoutHtml();

  try {
    const mail = new MailComposer({
      from: `"Ideeri Desk" <${account.email}>`,
      to,
      // Nom aplati sur une ligne avant d'entrer dans un en-tête : il vient du
      // profil Google de l'agent (injection d'en-tête), même précaution que
      // l'email de mention.
      subject: `Ticket #${ticket.number} vous a été assigné par ${actorName.replace(/[\r\n]+/g, " ")}`,
      text: renderTicketAssignedEmailText(payload),
      html: renderTicketAssignedEmailHtml({ ...payload, layoutHtml, logoUrl: getLogoUrl() }),
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
  const html = renderTicketClosureEmailHtml({
    layoutHtml: await getEmailLayoutHtml(),
    ticketNumber: ticket.number,
    senderName,
    bodyHtml,
    logoUrl,
  });
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
