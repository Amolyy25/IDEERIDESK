/**
 * Reconnaissance du type réel d'un fichier par sa signature (« magic bytes »).
 *
 * Pourquoi c'est indispensable à côté de l'antivirus : jusqu'ici, le seul
 * contrôle de type sur les routes de téléversement portait sur `File.type`,
 * c'est-à-dire l'en-tête `Content-Type` de la partie multipart — une chaîne
 * fournie par le client, qu'un formulaire fabriqué à la main choisit librement.
 * Un exécutable renvoyé sous `image/png` passait donc la liste blanche, était
 * stocké tel quel, puis resservi avec ce type par nos routes de lecture.
 *
 * L'antivirus attrape les charges connues ; la signature attrape la catégorie
 * entière : ce qui n'est pas d'un format reconnu n'entre pas, connu du scanner
 * ou non. Les deux sont complémentaires, aucun ne remplace l'autre.
 */

/** Types canoniques renvoyés par la détection. */
export type SniffedType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/x-icon"
  | "application/pdf";

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0) {
  if (bytes.byteLength < offset + prefix.length) return false;
  return prefix.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string) {
  if (bytes.byteLength < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Renvoie le type réel du contenu, ou `null` si aucune signature connue ne
 * correspond.
 */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // JPEG : SOI + début du premier marqueur. Les variantes JFIF/Exif/SPIFF
  // partagent ces trois octets.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) return "image/gif";

  // WEBP est un conteneur RIFF : "RIFF" <taille sur 4 octets> "WEBP".
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image/webp";

  // ICO : type de ressource 1 (icône) dans l'en-tête ICONDIR.
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";

  if (asciiAt(bytes, 0, "%PDF-")) return "application/pdf";

  return null;
}

/**
 * `image/x-icon` et `image/vnd.microsoft.icon` désignent le même format ; les
 * navigateurs envoient l'un ou l'autre selon la plateforme. Sans cette
 * équivalence, un favicon légitime serait refusé une fois sur deux.
 */
function canonical(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  return normalized === "image/vnd.microsoft.icon" ? "image/x-icon" : normalized;
}

export type SignatureCheck =
  | { ok: true; type: SniffedType }
  | { ok: false; reason: "unknown" | "mismatch"; detected: SniffedType | null };

/**
 * Vérifie que le contenu est d'un format reconnu ET que sa signature correspond
 * au type annoncé — on refuse aussi le décalage entre les deux, pas seulement le
 * contenu non reconnu : un GIF annoncé en PNG signale au minimum un client qui
 * ment sur ce qu'il envoie. La liste des types acceptés, elle, reste celle de
 * l'appelant : le PDF n'entre que là où elle le prévoit.
 */
export function checkFileSignature(bytes: Uint8Array, declaredType: string): SignatureCheck {
  const detected = sniffFileType(bytes);
  if (!detected) return { ok: false, reason: "unknown", detected: null };
  if (detected !== canonical(declaredType)) return { ok: false, reason: "mismatch", detected };
  return { ok: true, type: detected };
}
