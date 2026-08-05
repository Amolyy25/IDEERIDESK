import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { validateAttachmentFile } from "@/lib/attachment-rules";

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

  const error = validateAttachmentFile(file);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer()).slice();
  const image = await prisma.knowledgeArticleImage.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: buffer,
    },
  });

  return NextResponse.json({ id: image.id, url: `/api/knowledge-base/images/${image.id}` });
}
