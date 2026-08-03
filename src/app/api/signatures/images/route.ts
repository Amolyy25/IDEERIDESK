import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";

export const MAX_SIGNATURE_IMAGE_SIZE = 1024 * 1024; // 1 Mo

// Pas de SVG : un SVG servi depuis notre domaine peut embarquer du script, donc
// ouvrir l'URL de l'image l'exécuterait en même origine. Le GIF est accepté ici
// (et pas pour le logo du portail) parce que les clients mail l'affichent et
// qu'une signature en contient parfois un.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Téléversement d'une image de signature — réservé aux administrateurs, comme
 * le réglage lui-même.
 *
 * Stockée en `PortalAsset` et servie par /api/portal/assets/[id], donc **sans
 * authentification** : cette image est chargée par le client mail du
 * destinataire, qui n'a évidemment pas de session. Les images d'article
 * (/api/knowledge-base/images) ne conviennent pas pour cette raison — elles
 * exigent un agent connecté tant qu'aucun article publié ne les référence, et
 * une signature n'est jamais « publiée » nulle part.
 *
 * L'URL renvoyée est absolue : un `src` relatif ne s'affiche dans aucun client
 * mail. C'est aussi pourquoi l'absence d'APP_URL est une erreur franche plutôt
 * qu'un repli silencieux sur un chemin relatif, qui donnerait une signature
 * cassée chez tous les clients sans que personne ne le voie côté back-office.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Action réservée aux administrateurs." }, { status: 403 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      {
        error:
          "APP_URL n'est pas configurée : impossible de construire l'adresse absolue dont une image d'email a besoin.",
      },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté. Utilisez un PNG, JPEG, WEBP ou GIF." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIGNATURE_IMAGE_SIZE) {
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

  return NextResponse.json({
    id: asset.id,
    url: `${appUrl.replace(/\/+$/, "")}/api/portal/assets/${asset.id}`,
  });
}
