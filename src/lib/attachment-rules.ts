

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export function validateAttachmentFile(file: { type: string; size: number }) {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return "Format de fichier non supporté. Utilisez une image (PNG, JPEG, WEBP ou GIF).";
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return "Fichier trop volumineux (5 Mo maximum).";
  }
  return null;
}
