import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_SIZE_ERROR,
  ATTACHMENT_TYPE_ERROR,
  MAX_ATTACHMENT_SIZE,
} from "@/lib/attachment-rules";
import { inspectUploadedFile } from "@/lib/upload-inspection";

export async function POST(request: NextRequest) {
  // Dépôt de fichier en base : réservé aux agents habilités à rédiger, pas à
  // tout porteur de cookie de session.
  try {
    await requirePermission("kb.manage");
  } catch {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  const inspection = await inspectUploadedFile(file, {
    allowedTypes: ALLOWED_ATTACHMENT_TYPES,
    maxSize: MAX_ATTACHMENT_SIZE,
    typeError: ATTACHMENT_TYPE_ERROR,
    sizeError: ATTACHMENT_SIZE_ERROR,
    origin: "kb-image",
  });
  if (!inspection.ok) {
    return NextResponse.json({ error: inspection.error }, { status: inspection.status });
  }

  const image = await prisma.knowledgeArticleImage.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: inspection.buffer.byteLength,
      data: inspection.buffer,
      ...inspection.scan,
    },
  });

  return NextResponse.json({ id: image.id, url: `/api/knowledge-base/images/${image.id}` });
}
