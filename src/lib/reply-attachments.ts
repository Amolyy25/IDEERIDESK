// Fichiers joints à une réponse d'agent : contrôle de ce qui arrive du
// navigateur, chargement de ce qui part avec l'email, recopie sur les doublons.

import { prisma } from "@/lib/prisma";
import {
  ATTACHMENT_SIZE_ERROR,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  REPLY_ALLOWED_ATTACHMENT_TYPES,
  REPLY_ATTACHMENT_TYPE_ERROR,
} from "@/lib/attachment-rules";
import { inspectUploadedFile, type ScanColumns } from "@/lib/upload-inspection";
import type { MailAttachment } from "@/lib/gmail-send";

/** Refus imputable au fichier : le message est montré tel quel à l'agent. */
export class ReplyAttachmentError extends Error {}

/** Ligne prête pour le `create` imbriqué du message. */
export type ReplyAttachmentRow = {
  filename: string;
  mimeType: string;
  size: number;
  data: Uint8Array<ArrayBuffer>;
} & ScanColumns;

// Type, taille, signature du contenu et antivirus : tout est refait ici, le
// pré-contrôle du navigateur ne prouvant rien. Lève au premier fichier refusé.
export async function inspectReplyAttachments(files: File[]): Promise<ReplyAttachmentRow[]> {
  if (files.length > MAX_ATTACHMENTS) {
    throw new ReplyAttachmentError(
      `Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers à une réponse.`,
    );
  }

  const rows: ReplyAttachmentRow[] = [];
  for (const file of files) {
    const inspection = await inspectUploadedFile(file, {
      allowedTypes: REPLY_ALLOWED_ATTACHMENT_TYPES,
      maxSize: MAX_ATTACHMENT_SIZE,
      typeError: REPLY_ATTACHMENT_TYPE_ERROR,
      sizeError: ATTACHMENT_SIZE_ERROR,
      origin: "ticket-reply",
    });
    if (!inspection.ok) {
      throw new ReplyAttachmentError(inspection.error);
    }
    rows.push({
      filename: file.name,
      mimeType: file.type,
      size: inspection.buffer.byteLength,
      data: inspection.buffer,
      ...inspection.scan,
    });
  }

  return rows;
}

export type StoredAttachment = Awaited<ReturnType<typeof loadMessageAttachments>>[number];

// Le filtre sur la quarantaine sert au cas de la réponse retenue en validation :
// le fichier est stocké avant le verdict du scanner, et un rescan peut le
// basculer en INFECTED entre-temps (ses octets sont alors purgés).
export async function loadMessageAttachments(messageId: string) {
  return prisma.attachment.findMany({
    where: { messageId, scanStatus: { not: "INFECTED" } },
    orderBy: { createdAt: "asc" },
  });
}

export function toMailAttachments(stored: StoredAttachment[]): MailAttachment[] {
  return stored.map((file) => ({
    filename: file.filename,
    content: Buffer.from(file.data),
    contentType: file.mimeType,
  }));
}

// Les octets sont recopiés et non partagés : une ligne ne porte qu'un `messageId`,
// et le fil du doublon doit montrer les mêmes fichiers que celui de l'original.
export async function copyAttachmentsToMessage(
  stored: StoredAttachment[],
  target: { ticketId: string; messageId: string },
) {
  if (stored.length === 0) return;

  await prisma.attachment.createMany({
    data: stored.map((file) => ({
      ticketId: target.ticketId,
      messageId: target.messageId,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      data: file.data,
      scanStatus: file.scanStatus,
      scanSignature: file.scanSignature,
      scannedAt: file.scannedAt,
    })),
  });
}
