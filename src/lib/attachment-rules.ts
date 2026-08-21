/**
 * Règles de pièces jointes partagées par le navigateur et le serveur.
 *
 * Ce module est importé par des composants client (`portal-ticket-form`,
 * `widget-form`) : il ne doit donc dépendre d'aucune API Node. Les contrôles
 * qui en ont besoin — signature du contenu, antivirus — vivent dans
 * `upload-inspection.ts`, côté serveur uniquement.
 *
 * Ce qui est fait ici n'est qu'un pré-contrôle de confort : il évite au
 * visiteur de téléverser 5 Mo pour se voir refuser ensuite. La décision qui
 * fait foi est celle du serveur, qui refait tout — `File.type` et `File.size`
 * sont annoncés par le client et ne prouvent rien.
 */

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const ATTACHMENT_TYPE_ERROR =
  "Format de fichier non supporté. Utilisez une image (PNG, JPEG, WEBP ou GIF).";
export const ATTACHMENT_SIZE_ERROR = "Fichier trop volumineux (5 Mo maximum).";

// Le PDF n'est ouvert qu'aux réponses d'agent : un devis ou une notice ne se
// joint pas en capture d'écran. Les formulaires publics restent aux images —
// c'est le seul dépôt de fichier ouvert à des tiers non authentifiés.
export const REPLY_ALLOWED_ATTACHMENT_TYPES = [...ALLOWED_ATTACHMENT_TYPES, "application/pdf"];

export const REPLY_ATTACHMENT_TYPE_ERROR =
  "Format de fichier non supporté. Joignez une image (PNG, JPEG, WEBP, GIF) ou un PDF.";

/** Formulaires publics : portail et widget. */
export function validateAttachmentFile(file: { type: string; size: number }) {
  return validate(file, ALLOWED_ATTACHMENT_TYPES, ATTACHMENT_TYPE_ERROR);
}

/** Réponse ou note d'un agent depuis la fiche ticket. */
export function validateReplyAttachmentFile(file: { type: string; size: number }) {
  return validate(file, REPLY_ALLOWED_ATTACHMENT_TYPES, REPLY_ATTACHMENT_TYPE_ERROR);
}

function validate(
  file: { type: string; size: number },
  allowedTypes: readonly string[],
  typeError: string,
) {
  if (!allowedTypes.includes(file.type)) {
    return typeError;
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return ATTACHMENT_SIZE_ERROR;
  }
  return null;
}
