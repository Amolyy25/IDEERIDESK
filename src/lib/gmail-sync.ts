import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedGmailClient } from "@/lib/google-oauth";

const TICKET_TAG_PATTERN = /\[#(\d+)\]/;

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

// `.slice()` forces the concrete `Uint8Array<ArrayBuffer>` type Prisma's Bytes
// fields expect — a bare Buffer/Uint8Array is typed as backed by the wider
// `ArrayBufferLike`, which TS rejects for the Bytes column type.
function toBytesField(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer).slice();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Repère où commence le message précédent que le client répond, cité
// automatiquement par son client mail (Gmail, Outlook, Apple Mail…) — sans
// ça, chaque réponse traînerait tout l'historique déjà visible dans le fil
// du ticket, en double, à chaque tour.
// `[\s\S]` (pas `.`) et pas d'ancre `$` de fin : les clients mail en texte
// brut wrappent les longues lignes d'en-tête ("...a" / "écrit :" finissent
// sur deux lignes séparées) — un `.{0,120}` qui ne traverse pas les sauts de
// ligne raterait exactement ce cas, pourtant le plus courant.
const QUOTE_HEADER_PATTERNS = [
  /^Le\s[\s\S]{0,150}?a\s+écrit\s?:/im, // Gmail/Apple Mail FR : "Le ven. 24 juil. 2026 à 15:36, X <y> a écrit :"
  /^On\s[\s\S]{0,150}?wrote\s?:/im, // Gmail/Apple Mail EN : "On Fri, Jul 24, 2026 at 3:36 PM X <y> wrote:"
  /^-{2,}\s?(Original Message|Message d'origine)\s?-{2,}/im, // Outlook
];

function stripQuotedReply(text: string): string {
  let cutIndex = text.length;

  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }

  // Coupe aussi à la première ligne citée en "> " (convention texte brut
  // universelle, indépendante de la langue du client mail).
  let offset = 0;
  for (const line of text.split("\n")) {
    if (/^\s*>/.test(line) && offset < cutIndex) {
      cutIndex = offset;
      break;
    }
    offset += line.length + 1;
  }

  return text.slice(0, cutIndex).trim();
}

type BodyParts = { text: string | null; html: string | null };

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): BodyParts {
  const result: BodyParts = { text: null, html: null };
  if (!part) return result;

  function walk(node: gmail_v1.Schema$MessagePart) {
    const isAttachment = Boolean(node.filename);
    if (!isAttachment && node.body?.data) {
      if (node.mimeType === "text/plain" && !result.text) {
        result.text = decodeBase64Url(node.body.data).toString("utf-8");
      } else if (node.mimeType === "text/html" && !result.html) {
        result.html = decodeBase64Url(node.body.data).toString("utf-8");
      }
    }
    node.parts?.forEach(walk);
  }

  walk(part);
  return result;
}

type AttachmentPart = { filename: string; mimeType: string; attachmentId?: string; data?: string };

function extractAttachmentParts(part: gmail_v1.Schema$MessagePart | undefined): AttachmentPart[] {
  const results: AttachmentPart[] = [];
  if (!part) return results;

  function walk(node: gmail_v1.Schema$MessagePart) {
    if (node.filename && node.body) {
      results.push({
        filename: node.filename,
        mimeType: node.mimeType ?? "application/octet-stream",
        attachmentId: node.body.attachmentId ?? undefined,
        data: node.body.data ?? undefined,
      });
    }
    node.parts?.forEach(walk);
  }

  walk(part);
  return results;
}

async function resolveTicket(subject: string | undefined, gmailThreadId: string) {
  const byThread = await prisma.ticket.findFirst({ where: { gmailThreadId } });
  if (byThread) return byThread;

  const tagMatch = subject?.match(TICKET_TAG_PATTERN);
  if (tagMatch) {
    const byNumber = await prisma.ticket.findUnique({ where: { number: Number(tagMatch[1]) } });
    if (byNumber) return byNumber;
  }

  return null;
}

async function downloadAttachments(
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
  parts: AttachmentPart[]
) {
  const attachments: {
    filename: string;
    mimeType: string;
    size: number;
    data: Uint8Array<ArrayBuffer>;
  }[] = [];

  for (const part of parts) {
    let buffer: Buffer;
    if (part.data) {
      buffer = decodeBase64Url(part.data);
    } else if (part.attachmentId) {
      const { data } = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: gmailMessageId,
        id: part.attachmentId,
      });
      if (!data.data) continue;
      buffer = decodeBase64Url(data.data);
    } else {
      continue;
    }
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      size: buffer.byteLength,
      data: toBytesField(buffer),
    });
  }

  return attachments;
}

async function processInboundMessage(gmail: gmail_v1.Gmail, gmailMessageId: string) {
  const alreadyProcessed = await prisma.message.findUnique({
    where: { gmailMessageId },
    select: { id: true },
  });
  if (alreadyProcessed) return { skipped: true as const };

  const { data: message } = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  });

  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const gmailThreadId = message.threadId ?? gmailMessageId;

  const existingTicket = await resolveTicket(subject, gmailThreadId);

  // La boîte connectée est une boîte Gmail normale, pas une adresse dédiée
  // exclusivement au support — elle reçoit aussi des emails sans rapport
  // avec un ticket. On ne crée donc plus de ticket à partir d'un email
  // inconnu : seuls les emails qui répondent à un ticket déjà existant
  // (créé via le dashboard ou le widget) sont pris en compte. Un email sans
  // correspondance est simplement ignoré, pas transformé en ticket parasite.
  if (!existingTicket) {
    return { skipped: false as const, action: "ignored" as const };
  }

  const body = extractBody(message.payload);
  const rawContent = body.text?.trim() || (body.html ? stripHtml(body.html) : "") || "";
  const content = stripQuotedReply(rawContent) || "(message vide)";
  const attachmentParts = extractAttachmentParts(message.payload);

  const created = await prisma.message.create({
    data: {
      ticketId: existingTicket.id,
      content,
      authorType: "CLIENT",
      isPrivate: false,
      gmailMessageId,
    },
  });
  await prisma.ticket.update({
    where: { id: existingTicket.id },
    data: {
      gmailThreadId,
      emailMessageId: messageIdHeader ?? existingTicket.emailMessageId,
      hasUnreadActivity: true,
      updatedAt: new Date(),
    },
  });

  const attachments = await downloadAttachments(gmail, gmailMessageId, attachmentParts);
  if (attachments.length > 0) {
    await prisma.attachment.createMany({
      data: attachments.map((a) => ({ ...a, ticketId: existingTicket.id })),
    });
  }

  return {
    skipped: false as const,
    action: "appended" as const,
    ticketId: existingTicket.id,
    messageId: created.id,
  };
}

export async function syncGmailInbox() {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { connected: false as const, appended: 0, ignored: 0, skipped: 0, failed: 0 };
  }
  const { gmail, account } = authenticated;

  let messageIds: string[] = [];
  let newHistoryId = account.historyId;

  if (account.historyId) {
    const { data } = await gmail.users.history.list({
      userId: "me",
      startHistoryId: account.historyId,
      historyTypes: ["messageAdded"],
    });
    const seen = new Set<string>();
    for (const record of data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        // Only messages that actually landed in the inbox — history also
        // reports our own outbound sends (labeled SENT), which must not be
        // re-processed as if the client had written in.
        const labels = added.message?.labelIds ?? [];
        if (added.message?.id && labels.includes("INBOX")) {
          seen.add(added.message.id);
        }
      }
    }
    messageIds = Array.from(seen);
    newHistoryId = data.historyId ?? account.historyId;
  } else {
    // Premier sync : pas d'historique connu, on amorce le curseur sans
    // traiter le backlog complet (on récupère juste le point de départ).
    const { data: profile } = await gmail.users.getProfile({ userId: "me" });
    newHistoryId = profile.historyId ?? null;
  }

  let appended = 0;
  let ignored = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of messageIds) {
    try {
      const result = await processInboundMessage(gmail, id);
      if (result.skipped) skipped++;
      else if (result.action === "ignored") ignored++;
      else appended++;
    } catch (error) {
      // Distinct de `skipped` (déjà traité, cas normal) : ici le message n'a
      // jamais été enregistré et sera retenté au prochain sync tant que
      // l'erreur persiste — sans ce log, un email malformé qui plante en
      // boucle est invisible (le compteur ne dit pas lequel ni pourquoi).
      failed++;
      console.error(`[gmail-sync] échec du traitement du message ${id} :`, error);
    }
  }

  if (newHistoryId && newHistoryId !== account.historyId) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { historyId: newHistoryId },
    });
  }

  return { connected: true as const, appended, ignored, skipped, failed };
}
