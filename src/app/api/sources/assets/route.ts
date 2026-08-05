import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

export const MAX_SOURCE_ASSET_SIZE = 1024 * 1024; // 1 Mo

// Pas de SVG : un SVG servi depuis notre domaine peut embarquer du script, donc
// un visiteur ouvrant l'URL du visuel exécuterait ce script en même origine.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Téléversement de l'en-tête d'un formulaire de source (réservé aux
 * administrateurs). Le visuel est stocké comme les autres visuels publics et
 * servi par /api/portal/assets/[id] ; l'URL renvoyée est enregistrée dans
 * `Source.logoUrl` par le form builder, au moment où l'admin enregistre.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("settings.channels");
  } catch {
    return NextResponse.json({ error: "Action réservée aux administrateurs." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté. Utilisez un PNG, JPEG ou WEBP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SOURCE_ASSET_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (1 Mo maximum)." }, { status: 400 });
  }

  const asset = await prisma.portalAsset.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: new Uint8Array(await file.arrayBuffer()).slice(),
    },
  });

  return NextResponse.json({ id: asset.id, url: `/api/portal/assets/${asset.id}` });
}
