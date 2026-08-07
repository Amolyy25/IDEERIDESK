import type { FileScanStatus } from "@/generated/prisma/client";
import { scanBuffer } from "@/lib/antivirus";
import { checkFileSignature } from "@/lib/file-signature";

/**
 * Contrôle commun à **tous** les points d'entrée de fichiers de l'application.
 *
 * Le portail public, le widget, les images d'article, les images de signature,
 * le logo du portail et l'en-tête de source écrivaient chacun leur propre suite
 * de `if` — liste blanche de types et taille maximale, rien d'autre. Passer par
 * une seule fonction est ce qui garantit qu'un futur champ d'upload hérite du
 * contrôle sans que personne ait à y penser : le jour où on ajoute une étape,
 * elle s'applique partout.
 *
 * Ordre des contrôles, du moins cher au plus cher : type annoncé, taille,
 * signature du contenu, puis antivirus. Inutile de pousser 5 Mo à clamd pour un
 * fichier que la taille disqualifie déjà.
 */

/** Colonnes d'état d'analyse, communes aux trois tables qui stockent des octets. */
export type ScanColumns = {
  scanStatus: FileScanStatus;
  scanSignature: string | null;
  scannedAt: Date | null;
};

export type UploadInspection =
  | { ok: true; buffer: Uint8Array<ArrayBuffer>; scan: ScanColumns }
  | { ok: false; error: string; status: number };

export type InspectOptions = {
  allowedTypes: readonly string[];
  maxSize: number;
  /** Message rendu au client si le type annoncé n'est pas dans la liste. */
  typeError: string;
  /** Message rendu au client si le fichier dépasse la taille maximale. */
  sizeError: string;
  /** Pour les journaux serveur : d'où vient ce fichier. */
  origin: string;
};

const INFECTED_ERROR = "Ce fichier a été refusé par l'analyse antivirus.";
const SIGNATURE_ERROR =
  "Le contenu de ce fichier ne correspond pas à une image valide. Renvoyez le fichier d'origine.";

/**
 * Soumet des octets déjà en mémoire au scanner et renvoie de quoi remplir les
 * colonnes d'état.
 *
 * `null` signifie « rejeté » : le fichier est reconnu malveillant et ne doit
 * pas être écrit. Un scanner injoignable ne rejette rien — il renvoie PENDING,
 * et /api/cron/antivirus reprendra le fichier plus tard. Couper les
 * téléversements parce que le démon redémarre serait un déni de service qu'on
 * s'infligerait à soi-même, sur un chemin (le portail public) où le fichier est
 * de toute façon inerte tant qu'aucun agent ne l'ouvre.
 */
export async function scanForStorage(
  bytes: Uint8Array,
  origin: string,
): Promise<ScanColumns | null> {
  const verdict = await scanBuffer(bytes);

  if (verdict.status === "INFECTED") {
    // La signature reste côté serveur : elle n'apprend rien d'utile à un
    // déposant légitime, et renseigne un attaquant sur ce qui a été détecté.
    console.warn(`[antivirus] fichier refusé (${origin}) — signature ${verdict.signature}`);
    return null;
  }

  if (verdict.status === "UNAVAILABLE") {
    console.warn(`[antivirus] scanner indisponible (${origin}) — ${verdict.reason}`);
    return { scanStatus: "PENDING", scanSignature: null, scannedAt: null };
  }

  return { scanStatus: "CLEAN", scanSignature: null, scannedAt: new Date() };
}

/**
 * Contrôle complet d'un fichier reçu en `multipart/form-data`.
 */
export async function inspectUploadedFile(
  file: File,
  options: InspectOptions,
): Promise<UploadInspection> {
  if (!options.allowedTypes.includes(file.type)) {
    return { ok: false, error: options.typeError, status: 400 };
  }
  if (file.size > options.maxSize) {
    return { ok: false, error: options.sizeError, status: 400 };
  }

  const buffer = new Uint8Array(await file.arrayBuffer()).slice();

  // `file.size` vient de l'en-tête de la partie multipart. On revérifie sur les
  // octets réellement lus plutôt que de faire confiance à la valeur annoncée.
  if (buffer.byteLength > options.maxSize) {
    return { ok: false, error: options.sizeError, status: 400 };
  }

  const signature = checkFileSignature(buffer, file.type);
  if (!signature.ok) {
    console.warn(
      `[upload] signature refusée (${options.origin}) — annoncé ${file.type}, détecté ${
        signature.detected ?? "inconnu"
      }`,
    );
    return { ok: false, error: SIGNATURE_ERROR, status: 400 };
  }

  const scan = await scanForStorage(buffer, options.origin);
  if (!scan) {
    // 422 et non 400 : la requête est bien formée, c'est son contenu qu'on
    // refuse.
    return { ok: false, error: INFECTED_ERROR, status: 422 };
  }

  return { ok: true, buffer, scan };
}
