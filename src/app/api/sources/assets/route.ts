import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { inspectUploadedFile } from "@/lib/upload-inspection";

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

  const inspection = await inspectUploadedFile(file, {
    allowedTypes: ALLOWED_TYPES,
    maxSize: MAX_SOURCE_ASSET_SIZE,
    typeError: "Format non supporté. Utilisez un PNG, JPEG ou WEBP.",
    sizeError: "Fichier trop volumineux (1 Mo maximum).",
    origin: "source-asset",
  });
  if (!inspection.ok) {
    return NextResponse.json({ error: inspection.error }, { status: inspection.status });
  }

  const asset = await prisma.portalAsset.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: inspection.buffer.byteLength,
      data: inspection.buffer,
      ...inspection.scan,
    },
  });

  return NextResponse.json({ id: asset.id, url: `/api/portal/assets/${asset.id}` });
}
