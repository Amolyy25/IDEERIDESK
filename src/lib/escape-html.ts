/**
 * Échappement du texte inséré dans du HTML construit à la main (gabarits
 * d'email). Module sans dépendance : il est importé aussi bien côté serveur que
 * dans l'aperçu des réglages, rendu dans le navigateur.
 */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
