import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma, TicketSource } from "@/generated/prisma/client";
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_SIZE_ERROR,
  ATTACHMENT_TYPE_ERROR,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
} from "@/lib/attachment-rules";
import { inspectUploadedFile, type ScanColumns } from "@/lib/upload-inspection";
import { resolveTicketClient } from "@/lib/client-identity";
import { sendTicketAcknowledgement } from "@/lib/ticket-acknowledgement";
import { slaDueDatesForNewTicket } from "@/lib/sla-store";
import { notifyQueueOnNewTicket } from "@/lib/queue-notifications";

export { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachment-rules";

export const widgetTicketSchema = z.object({
  subject: z.string().trim().min(1, "Sujet requis").max(200),
  description: z.string().trim().min(1, "Description requise").max(5000),
  name: z.string().trim().min(1).max(120).optional(),
  // Normalisé en minuscules pour matcher Client.email de façon cohérente
  // avec la synchro Gmail (sinon "Jean@Ex.com" et "jean@ex.com" créent deux
  // fiches client distinctes pour la même personne).
  email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
  categoryId: z.string().optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  // Slug de la source (`Source.slug`) dont le formulaire a été soumis. Absent
  // pour les intégrations historiques, qui retombent alors sur la source par
  // défaut de la route appelée.
  sourceSlug: z.string().trim().max(60).optional(),
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
  /** Verdict de `inspectUploadedFile`, reporté tel quel sur la ligne créée. */
  scan: ScanColumns;
};

function isEmptyValue(value: unknown) {
  return value === undefined || value === null || value === "" || value === false;
}

export async function createWidgetTicket(
  input: WidgetTicketInput,
  attachments: WidgetAttachmentInput[],
  fallbackSource: TicketSource = "WIDGET_PAPAIRIS"
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

  // La source détermine à la fois la classification du ticket et les champs
  // attendus. Une source désactivée n'accepte plus de soumission.
  const source = input.sourceSlug
    ? await prisma.source.findUnique({
        where: { slug: input.sourceSlug },
        include: { fields: { orderBy: { order: "asc" } } },
      })
    : null;

  if (input.sourceSlug && (!source || !source.isActive)) {
    throw new WidgetValidationError("Ce formulaire n'est plus disponible.");
  }

  const fieldValues = input.customFields ?? {};

  if (!source || source.useGlobalCustomFields) {
    const activeCustomFields = await prisma.customField.findMany({ where: { isActive: true } });
    for (const field of activeCustomFields) {
      if (!field.isRequired) continue;
      if (isEmptyValue(fieldValues[field.key])) {
        throw new WidgetValidationError(`Le champ « ${field.label} » est obligatoire.`);
      }
    }
  }

  for (const field of source?.fields ?? []) {
    if (!field.isRequired || field.type === "HEADER") continue;
    // Un champ « fichier » est satisfait par les pièces jointes du formulaire :
    // elles arrivent toutes dans la même liste, quel que soit le sélecteur.
    if (field.type === "FILE") {
      if (attachments.length === 0) {
        throw new WidgetValidationError(`Le champ « ${field.label} » est obligatoire.`);
      }
      continue;
    }
    if (isEmptyValue(fieldValues[field.key])) {
      throw new WidgetValidationError(`Le champ « ${field.label} » est obligatoire.`);
    }
  }

  // `trustName: true` : le nom vient d'être saisi dans le formulaire par la
  // personne elle-même, il fait donc autorité sur celui déjà en base — à
  // l'inverse du nom affiché d'un email entrant. La résolution passe par les
  // alias : une adresse écartée par une fusion de fiches retrouve son contact au
  // lieu d'en recréer un (voir `resolveTicketClient`).
  const client = await resolveTicketClient({
    email: input.email,
    name: input.name,
    trustName: true,
  });

  const ticket = await prisma.ticket.create({
    data: {
      subject: input.subject,
      description: input.description,
      source: source?.ticketSource ?? fallbackSource,
      formSourceId: source?.id ?? null,
      sourceUrl: input.sourceUrl || null,
      categoryId: input.categoryId || null,
      statusId: defaultStatus.id,
      priorityId: defaultPriority.id,
      clientId: client.id,
      // Horloge SLA : le délai court depuis l'envoi du formulaire, pas depuis le
      // moment où un agent ouvre la file.
      ...(await slaDueDatesForNewTicket(defaultPriority.id)),
      metadata: {
        ...fieldValues,
        _papairis: input.papairisContext ?? {},
      } as Prisma.InputJsonValue,
      attachments: {
        create: attachments.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          data: file.buffer,
          ...file.scan,
        })),
      },
    },
  });

  // Accusé de réception au client : best-effort et non bloquant côté résultat —
  // `sendTicketAcknowledgement` ne lève pas, le ticket reste créé même si Gmail
  // n'est pas connecté ou si aucun modèle n'est configuré.
  await sendTicketAcknowledgement(ticket.id);

  // Puis l'équipe : les agents dont un groupe couvre le produit du ticket. Après
  // l'accusé de réception, dans l'ordre des priorités — le client d'abord.
  await notifyQueueOnNewTicket({ ticketId: ticket.id });

  return ticket;
}

function parseCustomFields(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export type ParsedWidgetRequest =
  | { ok: true; data: WidgetTicketInput; attachments: WidgetAttachmentInput[] }
  | { ok: false; error: string; status: number };

// Partagé par le widget Papairis et le portail public : même formulaire de
// création de ticket sans connexion. La classification enregistrée vient de la
// source soumise (`sourceSlug`), ou à défaut de la route appelée (voir
// `createWidgetTicket`).
export async function parseWidgetFormRequest(formData: FormData): Promise<ParsedWidgetRequest> {
  const rawInput = {
    subject: formData.get("subject")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    name: formData.get("name")?.toString() || undefined,
    email: formData.get("email")?.toString() ?? "",
    categoryId: formData.get("categoryId")?.toString() || undefined,
    sourceUrl: formData.get("sourceUrl")?.toString() || undefined,
    sourceSlug: formData.get("sourceSlug")?.toString() || undefined,
    customFields: parseCustomFields(formData.get("customFields")?.toString()),
    papairisContext: {
      userId: formData.get("papairisUserId")?.toString() || undefined,
      appVersion: formData.get("papairisAppVersion")?.toString() || undefined,
      papairisClientId: formData.get("papairisClientId")?.toString() || undefined,
    },
  };

  const parsed = widgetTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Formulaire invalide.",
      status: 400,
    };
  }

  const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File);
  if (files.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers.`,
      status: 400,
    };
  }

  // Seul chemin de dépôt de fichier ouvert à des tiers non authentifiés : c'est
  // ici que le contrôle de contenu compte le plus. `inspectUploadedFile` refuse
  // ce qui n'est pas réellement une image et ce que le scanner reconnaît comme
  // malveillant ; un scanner injoignable laisse passer en « à rescanner »
  // plutôt que de bloquer la création de tickets.
  const attachments: WidgetAttachmentInput[] = [];
  for (const file of files) {
    const inspection = await inspectUploadedFile(file, {
      allowedTypes: ALLOWED_ATTACHMENT_TYPES,
      maxSize: MAX_ATTACHMENT_SIZE,
      typeError: ATTACHMENT_TYPE_ERROR,
      sizeError: ATTACHMENT_SIZE_ERROR,
      origin: "ticket-public",
    });
    if (!inspection.ok) {
      return { ok: false, error: inspection.error, status: inspection.status };
    }
    attachments.push({
      filename: file.name,
      mimeType: file.type,
      size: inspection.buffer.byteLength,
      buffer: inspection.buffer,
      scan: inspection.scan,
    });
  }

  return { ok: true, data: parsed.data, attachments };
}
