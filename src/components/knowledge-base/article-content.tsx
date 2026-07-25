import { ARTICLE_PROSE_CLASS } from "@/lib/article-html";

// Contenu HTML rédigé exclusivement par des agents via l'éditeur riche interne
// (jamais par un visiteur externe) — le rendu direct ne traite pas d'entrée
// utilisateur non maîtrisée, contrairement à un commentaire public par ex.
export function ArticleContent({ title, html }: { title: string; html: string }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <div className={ARTICLE_PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
