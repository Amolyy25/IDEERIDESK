// Contenu HTML rédigé exclusivement par des agents via l'éditeur riche interne
// (jamais par un visiteur externe) — le rendu direct ne traite pas d'entrée
// utilisateur non maîtrisée, contrairement à un commentaire public par ex.
export function ArticleContent({ title, html }: { title: string; html: string }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <div
        className="prose-content max-w-none text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
