import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Publique, sans authentification : ces images illustrent des articles de la
// base de connaissances qui peuvent eux-mêmes être partagés publiquement — un
// visiteur anonyme sur un lien de partage public doit pouvoir les charger.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const image = await prisma.knowledgeArticleImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(image.filename)}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
