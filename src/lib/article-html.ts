/**
 * Rendu du contenu riche des articles (HTML produit par l'éditeur Tiptap).
 *
 * Les classes de mise en forme sont partagées : la page publique d'un article
 * et l'aperçu affiché dans les formulaires de ticket doivent rendre le même
 * HTML de la même façon, sinon un titre ou une liste apparaît formaté d'un côté
 * et brut de l'autre.
 */

export const ARTICLE_PROSE_CLASS =
  "max-w-none text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_strong]:font-semibold [&_em]:italic [&_hr]:my-4 [&_hr]:border-t [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:mb-3 [&_table]:w-full [&_table]:text-left [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_td]:border [&_td]:px-2 [&_td]:py-1";

/** Texte brut d'un contenu HTML, tronqué — pour les aperçus d'une ou deux lignes. */
export function htmlToPlainText(html: string, maxLength?: number) {
  const text = html
    // Contenu non rédactionnel : retirer les balises ne suffit pas, il faut
    // jeter ce qu'elles contiennent — un article collé depuis un éditeur
    // externe embarque souvent un <style>, dont les règles CSS se retrouvaient
    // sinon en toutes lettres dans l'aperçu.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Un saut de bloc doit rester une séparation de mots, sans quoi
    // « …fin.</p><p>Début… » se recolle en un seul mot.
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
