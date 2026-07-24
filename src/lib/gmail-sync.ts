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

function parseFromHeader(from: string | undefined) {
  if (!from) return { name: undefined, email: undefined };
  const match = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (!match) return { name: undefined, email: undefined };
  const name = match[1]?.trim() || undefined;
  const email = match[2]?.trim().toLowerCase();
  return { name, email };
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

async function findOrCreateClient(from: string | undefined) {
  const { name, email } = parseFromHeader(from);
  if (!email) return null;

  return prisma.client.upsert({
    where: { email },
    update: name ? { name } : {},
    create: { name: name ?? email, email },
  });
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
  const from = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const gmailThreadId = message.threadId ?? gmailMessageId;

  const client = await findOrCreateClient(from);
  const body = extractBody(message.payload);
  const content = body.text?.trim() || (body.html ? stripHtml(body.html) : "") || "(message vide)";
  const attachmentParts = extractAttachmentParts(message.payload);

  const existingTicket = await resolveTicket(subject, gmailThreadId);

  if (existingTicket) {
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
        updatedAt: new Date(),
      },
    });

    const attachments = await downloadAttachments(gmail, gmailMessageId, attachmentParts);
    if (attachments.length > 0) {
      await prisma.attachment.createMany({
        data: attachments.map((a) => ({ ...a, ticketId: existingTicket.id })),
      });
    }

    return { skipped: false as const, action: "appended" as const, ticketId: existingTicket.id, messageId: created.id };
  }

  const [defaultStatus, defaultPriority] = await Promise.all([
    prisma.ticketStatus.findFirst({ where: { isDefault: true }, orderBy: { order: "asc" } }),
    prisma.ticketPriority.findFirst({ where: { isDefault: true }, orderBy: { order: "asc" } }),
  ]);
  if (!defaultStatus || !defaultPriority) {
    throw new Error("Aucun statut ou priorité par défaut n'est configuré.");
  }

  const attachments = await downloadAttachments(gmail, gmailMessageId, attachmentParts);

  const ticket = await prisma.ticket.create({
    data: {
      subject: subject?.trim() || "(sans objet)",
      description: content,
      source: "EMAIL",
      statusId: defaultStatus.id,
      priorityId: defaultPriority.id,
      clientId: client?.id,
      gmailThreadId,
      gmailMessageId,
      emailMessageId: messageIdHeader,
      attachments: { create: attachments },
    },
  });

  return { skipped: false as const, action: "created" as const, ticketId: ticket.id };
}

export async function syncGmailInbox() {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return { connected: false as const, created: 0, appended: 0, skipped: 0 };
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
    // Premher sync : pas d'historique connu, on amorce le curseur sans
    // traiter le backlog complet (on récupère juste le point de départ).
    const { data: profile } = await gmail.users.getProfile({ userId: "me" });
    newHistoryId = profile.historyId ?? null;
  }

  let created = 0;
  let appended = 0;
  let skipped = 0;

  for (const id of messageIds) {
    try {
      const result = await processInboundMessage(gmail, id);
      if (result.skipped) skipped++;
      else if (result.action === "created") created++;
      else appended++;
    } catch {
      skipped++;
    }
  }

  if (newHistoryId && newHistoryId !== account.historyId) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { historyId: newHistoryId },
    });
  }

  return { connected: true as const, created, appended, skipped };
}
