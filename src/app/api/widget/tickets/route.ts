import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_ATTACHMENTS,
  WidgetValidationError,
  createWidgetTicket,
  validateAttachmentFile,
  widgetTicketSchema,
  type WidgetAttachmentInput,
} from "@/lib/widget";

function parseCustomFields(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const rawInput = {
    subject: formData.get("subject")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    name: formData.get("name")?.toString() || undefined,
    email: formData.get("email")?.toString() ?? "",
    categoryId: formData.get("categoryId")?.toString() || undefined,
    sourceUrl: formData.get("sourceUrl")?.toString() || undefined,
    customFields: parseCustomFields(formData.get("customFields")?.toString()),
    papairisContext: {
      userId: formData.get("papairisUserId")?.toString() || undefined,
      appVersion: formData.get("papairisAppVersion")?.toString() || undefined,
      papairisClientId: formData.get("papairisClientId")?.toString() || undefined,
    },
  };

  const parsed = widgetTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? "Formulaire invalide." },
      { status: 400 }
    );
  }

  const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File);

  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers.` },
      { status: 400 }
    );
  }

  const attachments: WidgetAttachmentInput[] = [];
  for (const file of files) {
    const error = validateAttachmentFile(file);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    const buffer = new Uint8Array(await file.arrayBuffer()).slice();
    attachments.push({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      buffer,
    });
  }

  try {
    const ticket = await createWidgetTicket(parsed.data, attachments);
    return NextResponse.json(
      { id: ticket.id, number: ticket.number },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    if (error instanceof WidgetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Impossible de créer le ticket pour le moment." },
      { status: 500 }
    );
  }
}
