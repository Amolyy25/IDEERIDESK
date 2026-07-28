import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Publique, sans authentification : logo et favicon du portail public sont par
// nature affichés à des visiteurs anonymes.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const asset = await prisma.portalAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Visuel introuvable." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      // Le type est validé à l'upload (PNG/JPEG/WEBP/ICO, jamais de SVG) :
      // `nosniff` garantit que le navigateur ne réinterprète pas le contenu
      // autrement que ce qu'on déclare.
      "X-Content-Type-Options": "nosniff",
      // Immutable : un nouveau téléversement crée un nouvel id, l'URL change.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
