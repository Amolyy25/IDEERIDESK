"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { ARTICLE_PROSE_CLASS } from "@/lib/article-html";

export type SuggestedArticle = {
  id: string;
  title: string;
  /** Aperçu en texte brut, calculé côté serveur. */
  preview: string;
  /** Page publique de l'article, si la FAQ du portail est activée. */
  url: string | null;
  /** Contenu riche, fourni seulement à défaut de page publique. */
  html: string | null;
};

/**
 * Articles susceptibles de répondre à la question avant même d'ouvrir un
 * ticket. Le contenu d'un article est du HTML riche : on ouvre donc sa page
 * publique dans un nouvel onglet, où il est rendu avec sa mise en forme — le
 * dépliage sur place affichait un texte aplati, sans titres ni listes, et
 * faisait perdre au visiteur le formulaire en cours de saisie.
 */
export function KnowledgeSuggestions({ articles }: { articles: SuggestedArticle[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (articles.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Ces articles pourraient déjà répondre à votre question
      </p>

      <div className="space-y-1.5">
        {articles.map((article) => {
          if (article.url) {
            return (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 rounded-md border bg-background px-3 py-2.5 transition-colors hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium group-hover:text-foreground">
                    {article.title}
                  </p>
                  {article.preview && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {article.preview}
                    </p>
                  )}
                </div>
                <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </a>
            );
          }

          // Pas de page publique (FAQ du portail désactivée) : l'article se
          // déplie sur place, rendu avec la même mise en forme que sa page.
          const isOpen = openId === article.id;
          return (
            <div key={article.id} className="rounded-md border bg-background">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : article.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{article.title}</p>
                  {!isOpen && article.preview && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {article.preview}
                    </p>
                  )}
                </div>
                {isOpen ? (
                  <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {isOpen && article.html && (
                <div className="border-t px-3 py-3">
                  {/* HTML rédigé par les agents dans l'éditeur interne, jamais
                      par un visiteur — même rendu que la page de l'article. */}
                  <div
                    className={ARTICLE_PROSE_CLASS}
                    dangerouslySetInnerHTML={{ __html: article.html }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
