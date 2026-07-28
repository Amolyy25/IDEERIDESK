import { ARTICLE_PROSE_CLASS } from "@/lib/article-html";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

// Le contenu est rédigé par des agents via l'éditeur riche interne, mais il est
// rendu ici via `dangerouslySetInnerHTML` sur des pages publiques (FAQ, lien de
// partage) et dans le navigateur d'admins : on l'assainit à l'affichage en plus
// de l'écriture. Cette seconde passe couvre les articles déjà en base et tout
// contenu qui serait écrit par un chemin oublié.
export function ArticleContent({ title, html }: { title: string; html: string }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <div
        className={ARTICLE_PROSE_CLASS}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
      />
    </article>
  );
}
