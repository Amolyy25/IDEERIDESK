import { emailAssetPath } from "@/lib/email-asset-urls";
import { prisma } from "@/lib/prisma";

/**
 * Héberge les images embarquées dans le HTML d'un email avant enregistrement.
 *
 * Une image collée dans l'éditeur arrive sous forme de `data:` — le fichier
 * entier encodé dans l'attribut `src`. Gmail et Outlook bloquent les images en
 * base64 : sans ce traitement, le destinataire voit une image « qui ne charge
 * pas », alors qu'elle n'a jamais quitté le back-office.
 *
 * Le fichier est donc extrait, rangé en `PortalAsset` et remplacé par son
 * chemin — le même trajet que les images de signature, servi par
 * /api/portal/assets/[id] sans authentification, puisque c'est le client mail
 * du destinataire qui viendra la chercher.
 *
 * Le chemin enregistré est **relatif** : l'origine publique est ajoutée à
 * l'envoi seulement, pour qu'un modèle enregistré ici reste valable partout
 * (voir `email-asset-urls.ts`).
 *
 * À appeler AVANT le nettoyage : après, il n'y a plus rien à héberger.
 */

/** Aligné sur le téléversement de signature : ni SVG (script), ni format exotique. */
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** 1 Mo par image, comme le téléversement manuel. */
const MAX_IMAGE_SIZE = 1024 * 1024;

/**
 * Nombre d'images hébergées en un seul enregistrement. Le HTML vient d'un
 * administrateur, mais un copier-coller depuis un document illustré peut en
 * charrier des dizaines : cette borne évite d'écrire plusieurs dizaines de Mo
 * en base sur un seul clic sur « Enregistrer ».
 */
const MAX_IMAGES_PER_SAVE = 20;

// `src` d'une balise <img>, en simples ou doubles quotes, contenant du base64.
const INLINE_IMAGE = /<img\b[^>]*?\ssrc=(["'])(data:image\/[a-z+]+;base64,[^"']+)\1/gi;

export class EmailImageError extends Error {}

/**
 * Remplace chaque image `data:` du HTML par le chemin du visuel enregistré.
 *
 * Rend le HTML inchangé quand il n'y a rien à héberger — le cas de très loin le
 * plus courant, qui ne doit donc coûter ni écriture ni requête.
 */
export async function hostInlineEmailImages(html: string): Promise<string> {
  const matches = Array.from(html.matchAll(INLINE_IMAGE));
  if (matches.length === 0) return html;

  if (matches.length > MAX_IMAGES_PER_SAVE) {
    throw new EmailImageError(
      `Trop d'images collées d'un coup (${matches.length}, maximum ${MAX_IMAGES_PER_SAVE}). ` +
        `Insérez-les en plusieurs fois.`
    );
  }

  // La même image collée deux fois ne doit être stockée qu'une fois : le corps
  // encodé sert de clé.
  const hostedByDataUrl = new Map<string, string>();

  for (const match of matches) {
    const dataUrl = match[2];
    if (hostedByDataUrl.has(dataUrl)) continue;
    hostedByDataUrl.set(dataUrl, emailAssetPath(await storeDataUrl(dataUrl)));
  }

  return html.replaceAll(INLINE_IMAGE, (whole, quote: string, dataUrl: string) => {
    const hosted = hostedByDataUrl.get(dataUrl);
    if (!hosted) return whole;
    return whole.replace(`${quote}${dataUrl}${quote}`, `${quote}${hosted}${quote}`);
  });
}

/** Décode une image `data:` et l'enregistre. Rend l'identifiant du visuel créé. */
async function storeDataUrl(dataUrl: string): Promise<string> {
  const separator = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice("data:".length, dataUrl.indexOf(";"));

  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new EmailImageError(
      `Format d'image non supporté (${mimeType}). Utilisez un PNG, JPEG, WEBP ou GIF.`
    );
  }

  const buffer = Buffer.from(dataUrl.slice(separator + 1), "base64");
  if (buffer.byteLength === 0) {
    throw new EmailImageError("Image illisible : le contenu collé est vide ou corrompu.");
  }
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    throw new EmailImageError(
      "Image trop volumineuse (1 Mo maximum). Réduisez-la avant de la coller."
    );
  }

  const asset = await prisma.portalAsset.create({
    data: {
      // Le collage ne transporte aucun nom de fichier : celui-ci n'apparaît que
      // dans l'en-tête `Content-Disposition`, il doit juste rester lisible.
      filename: `image-collee.${mimeType.split("/")[1]}`,
      mimeType,
      size: buffer.byteLength,
      data: new Uint8Array(buffer),
    },
  });

  return asset.id;
}
