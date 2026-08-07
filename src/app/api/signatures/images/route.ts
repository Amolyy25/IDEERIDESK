import { NextRequest, NextResponse } from "next/server";
import { emailAssetPath } from "@/lib/email-asset-urls";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { inspectUploadedFile } from "@/lib/upload-inspection";

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
 * Le chemin renvoyé est **relatif**. Un client mail ne résout aucun chemin
 * relatif, mais l'origine publique n'a pas à entrer ici : elle est ajoutée à
 * l'envoi (voir `email-asset-urls.ts`). Renvoyer une adresse absolue la ferait
 * enregistrer dans le HTML de la signature, qui partirait alors pour toujours
 * avec l'origine de l'environnement où l'image a été téléversée.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("settings.email");
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
    maxSize: MAX_SIGNATURE_IMAGE_SIZE,
    typeError: "Format non supporté. Utilisez un PNG, JPEG, WEBP ou GIF.",
    sizeError: "Fichier trop volumineux (1 Mo maximum).",
    origin: "signature-image",
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

  return NextResponse.json({ id: asset.id, url: emailAssetPath(asset.id) });
}
