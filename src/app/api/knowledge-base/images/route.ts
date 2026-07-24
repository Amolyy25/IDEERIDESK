import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { validateAttachmentFile } from "@/lib/attachment-rules";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
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
