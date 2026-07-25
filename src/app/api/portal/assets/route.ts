import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { revalidatePath } from "next/cache";

export const MAX_PORTAL_ASSET_SIZE = 1024 * 1024; // 1 Mo

// Pas de SVG : un SVG servi depuis notre domaine peut embarquer du script, donc
// un visiteur ouvrant l'URL du logo exécuterait ce script en même origine.
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_FAVICON_TYPES = [
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp",
];

/**
 * Téléversement du logo ou du favicon du portail (réservé aux administrateurs).
 * Le fichier remplace celui déjà en place et l'ancien est supprimé.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Action réservée aux administrateurs." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind");

  if (kind !== "logo" && kind !== "favicon") {
    return NextResponse.json({ error: "Type de visuel inconnu." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  const allowed = kind === "logo" ? ALLOWED_LOGO_TYPES : ALLOWED_FAVICON_TYPES;
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          kind === "logo"
            ? "Format non supporté. Utilisez un PNG, JPEG ou WEBP."
            : "Format non supporté. Utilisez un PNG, ICO ou WEBP.",
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_PORTAL_ASSET_SIZE) {
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

  const existing = await prisma.portalSettings.findFirst();
  const previousId = existing
    ? kind === "logo"
      ? existing.logoAssetId
      : existing.faviconAssetId
    : null;
  const patch = kind === "logo" ? { logoAssetId: asset.id } : { faviconAssetId: asset.id };

  if (existing) {
    await prisma.portalSettings.update({ where: { id: existing.id }, data: patch });
  } else {
    await prisma.portalSettings.create({ data: patch });
  }
  if (previousId) {
    await prisma.portalAsset.deleteMany({ where: { id: previousId } });
  }

  revalidatePath("/settings/portal");
  revalidatePath("/");
  revalidatePath("/faq");
  revalidatePath("/nouveau-ticket");

  return NextResponse.json({ id: asset.id, url: `/api/portal/assets/${asset.id}` });
}
