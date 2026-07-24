import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachment-rules";

export const widgetTicketSchema = z.object({
  subject: z.string().trim().min(1, "Sujet requis").max(200),
  description: z.string().trim().min(1, "Description requise").max(5000),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email("Email invalide"),
  categoryId: z.string().optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  papairisContext: z
    .object({
      userId: z.string().optional(),
      appVersion: z.string().optional(),
      papairisClientId: z.string().optional(),
    })
    .partial()
    .optional(),
});

export type WidgetTicketInput = z.infer<typeof widgetTicketSchema>;

export class WidgetValidationError extends Error {}

export type WidgetAttachmentInput = {
  filename: string;
  mimeType: string;
  size: number;
  buffer: Uint8Array<ArrayBuffer>;
};

export async function createWidgetTicket(
  input: WidgetTicketInput,
  attachments: WidgetAttachmentInput[]
) {
  const [defaultStatus, defaultPriority] = await Promise.all([
    prisma.ticketStatus.findFirst({
      where: { isDefault: true },
      orderBy: { order: "asc" },
    }),
    prisma.ticketPriority.findFirst({
      where: { isDefault: true },
      orderBy: { order: "asc" },
    }),
  ]);

  if (!defaultStatus || !defaultPriority) {
    throw new WidgetValidationError("Aucun statut ou priorité par défaut n'est configuré.");
  }

  const activeCustomFields = await prisma.customField.findMany({ where: { isActive: true } });
  const customFieldValues = input.customFields ?? {};

  for (const field of activeCustomFields) {
    if (!field.isRequired) continue;
    const value = customFieldValues[field.key];
    const isEmpty =
      value === undefined || value === null || value === "" || value === false;
    if (isEmpty) {
      throw new WidgetValidationError(`Le champ « ${field.label} » est obligatoire.`);
    }
  }

  const client = await prisma.client.upsert({
    where: { email: input.email },
    update: input.name ? { name: input.name } : {},
    create: { name: input.name ?? input.email, email: input.email },
  });

  const ticket = await prisma.ticket.create({
    data: {
      subject: input.subject,
      description: input.description,
      source: "WIDGET_PAPAIRIS",
      sourceUrl: input.sourceUrl || null,
      categoryId: input.categoryId || null,
      statusId: defaultStatus.id,
      priorityId: defaultPriority.id,
      clientId: client.id,
      metadata: {
        ...customFieldValues,
        _papairis: input.papairisContext ?? {},
      } as Prisma.InputJsonValue,
      attachments: {
        create: attachments.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          data: file.buffer,
        })),
      },
    },
  });

  return ticket;
}
