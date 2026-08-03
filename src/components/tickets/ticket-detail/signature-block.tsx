import { ARTICLE_PROSE_CLASS } from "@/lib/article-html";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";

/**
 * Signature de l'agent telle qu'elle partira dans l'email, affichée sous le
 * champ de réponse.
 *
 * Rendue ici et non insérée dans le champ de saisie : la réponse est du texte
 * brut, la signature du HTML (logo, images redimensionnées, liens). La coller
 * dans le champ afficherait ses balises à l'agent, et le client recevrait la
 * signature deux fois — le corps de l'email est assemblé à l'envoi (voir
 * `renderTicketReplyEmailHtml`).
 *
 * Composant serveur : `sanitizeEmailHtml` tire DOMPurify et jsdom, qui n'ont
 * rien à faire dans un bundle client. Assaini à l'affichage en plus de
 * l'enregistrement, comme le contenu des articles — cette seconde passe couvre
 * ce qui serait déjà en base.
 */
export function SignatureBlock({ html }: { html: string }) {
  return (
    <div
      // Mêmes classes que le rendu d'un article : un même HTML doit s'afficher
      // de la même façon partout dans l'application.
      className={ARTICLE_PROSE_CLASS}
      dangerouslySetInnerHTML={{ __html: withoutStyleBlocks(sanitizeEmailHtml(html)) }}
    />
  );
}

/**
 * Retire les blocs `<style>` pour cet affichage seulement.
 *
 * Un `<style>` de signature n'est pas encapsulé : affiché tel quel dans la page,
 * ses règles s'appliqueraient à toute la fiche ticket. L'email, lui, le conserve
 * — c'est pour ça que le filtrage est ici et pas à l'enregistrement.
 */
function withoutStyleBlocks(html: string) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
}
