import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/**
 * Images illustrant les articles de la base de connaissances.
 *
 * Ouverte sans authentification uniquement pour les images d'un article
 * réellement destiné au public (publié dans la FAQ, ou partagé en PUBLIC) : un
 * visiteur anonyme arrivant sur un lien de partage doit pouvoir les charger.
 * Pour tout le reste — brouillon, article partagé en INTERNAL — un agent
 * approuvé est exigé, sinon l'identifiant de l'image (présent en clair dans le
 * HTML de l'article) suffirait à sortir les captures d'écran de procédures
 * internes.
 *
 * `KnowledgeArticleImage` n'a volontairement pas de clé étrangère vers
 * l'article (une image reste valide si elle est déplacée, ou collée avant la
 * première sauvegarde) : le rattachement se déduit donc du contenu qui
 * référence son identifiant.
 */
async function isPubliclyReferenced(imageId: string) {
  const article = await prisma.knowledgeArticle.findFirst({
    where: {
      content: { contains: imageId },
      OR: [{ status: "PUBLISHED" }, { shareScope: "PUBLIC" }],
    },
    select: { id: true },
  });
  return Boolean(article);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const image = await prisma.knowledgeArticleImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }

  // Rattrapée par un rescan : octets déjà purgés. Même réponse qu'une image
  // absente, cette route étant ouverte aux visiteurs anonymes.
  if (image.scanStatus === "INFECTED") {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }

  const isPublic = await isPubliclyReferenced(id);
  if (!isPublic) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
    }
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(image.filename)}"`,
      "X-Content-Type-Options": "nosniff",
      // Cache public réservé aux images réellement publiques : sans ce
      // distinguo, un intermédiaire mettrait en cache l'image d'un brouillon et
      // la resservirait à un anonyme.
      "Cache-Control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, max-age=31536000, immutable",
    },
  });
}
