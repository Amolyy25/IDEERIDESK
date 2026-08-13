import { escapeHtml } from "@/lib/escape-html";

/**
 * Petites manipulations du HTML d'une réponse, partagées par la zone de
 * rédaction (navigateur) et par l'action d'envoi (serveur).
 *
 * Sans dépendance, volontairement : `sanitize-html.ts` tire DOMPurify et jsdom,
 * qui n'ont rien à faire dans un bundle client. Rien ici n'assainit quoi que ce
 * soit — l'assainissement reste `sanitizeReplyHtml`, côté serveur, à
 * l'enregistrement.
 */

/**
 * Texte brut converti en HTML d'éditeur : un paragraphe par bloc, un `<br>` par
 * saut de ligne simple.
 *
 * Sert aux textes qui arrivent de l'extérieur de l'éditeur et doivent y entrer :
 * réponse type, suggestion de l'IA, brouillon pré-rempli. Le texte est échappé —
 * une réponse type qui contiendrait `<` parle de code, elle ne fabrique pas de
 * balise.
 */
export function textToReplyHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Un document d'éditeur vide n'est pas une chaîne vide : Tiptap rend toujours au
 * moins `<p></p>`, et un paragraphe ne contenant qu'un `<br>` ou une espace
 * insécable compte tout autant pour rien. Sans ce test, le bouton d'envoi serait
 * actif sur un champ visuellement vide, et un email blanc partirait au client.
 */
export function isReplyHtmlEmpty(html: string): boolean {
  const stripped = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/ /g, " ");
  return stripped.trim().length === 0;
}

/**
 * Ajoute un bloc à la suite de ce qui est déjà écrit, sans jamais l'écraser.
 *
 * Même règle que dans la version texte de la zone de réponse : un clic sur la
 * mauvaise ligne de la liste des réponses types ne doit pas coûter la phrase en
 * cours de rédaction.
 */
export function appendReplyHtml(base: string, addition: string): string {
  if (isReplyHtmlEmpty(base)) return addition;
  return `${base}${addition}`;
}
