import { cn } from "@/lib/utils";

/**
 * Le corps d'un message du fil, sous la forme où il a été écrit.
 *
 * Deux rendus, décidés par la donnée et non par l'endroit : une réponse écrite
 * dans l'éditeur riche porte son HTML et s'affiche mise en forme ; tout le reste
 * — l'historique d'avant l'éditeur, les emails entrants réduits à leur texte à
 * la synchronisation, les notes internes — reste du texte à sauts de ligne
 * conservés. Le même composant sert le fil du ticket, les messages remontés des
 * doublons et la file de validation, pour qu'un même message ne s'affiche pas
 * différemment selon la page.
 *
 * Sur le HTML : il est inséré sans nouvelle passe d'assainissement, et c'est un
 * choix qui tient à une garantie précise — `contentHtml` n'est écrit que par
 * `resolveReplyBody`, qui le fait passer par `sanitizeReplyHtml`. Cette liste
 * blanche ne laisse ni script, ni gestionnaire d'événement, ni attribut `style`
 * ou `class`, ni la moindre balise qui charge une ressource : il ne reste que du
 * texte structuré et des liens. La colonne étant nouvelle, aucune ligne
 * antérieure à ce filtre n'existe — contrairement au contenu des articles, dont
 * la seconde passe au rendu couvre justement ce qui était déjà en base.
 */
export function MessageBody({
  content,
  contentHtml,
  className,
}: {
  /** Retranscription texte, toujours renseignée. */
  content: string;
  /** Mise en forme, quand le message en a une. */
  contentHtml?: string | null;
  className?: string;
}) {
  if (contentHtml) {
    return (
      <div
        className={cn(
          "text-sm leading-relaxed",
          // Reprend les règles de `ARTICLE_PROSE_CLASS`, réduites à ce que
          // `sanitizeReplyHtml` laisse passer : un titre, une liste ou une
          // citation doit s'afficher dans le fil comme dans l'éditeur qui vient
          // de l'écrire, sinon l'agent relit autre chose que ce qu'il a envoyé.
          "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold",
          "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold",
          "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold",
          "[&_p]:mb-3 [&_p:last-child]:mb-0",
          "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1",
          "[&_a]:text-primary [&_a]:underline",
          "[&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
          "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3",
          "[&_hr]:my-4 [&_hr]:border-t",
          className
        )}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    );
  }

  return <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>{content}</p>;
}
