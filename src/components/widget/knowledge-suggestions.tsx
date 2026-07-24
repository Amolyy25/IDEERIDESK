"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type SuggestedArticle = { id: string; title: string; excerpt: string | null; content: string };

// Le contenu d'un article est du HTML riche (éditeur Tiptap) depuis l'ajout
// de l'éditeur riche — sans ça, les balises brutes s'affichaient telles
// quelles dans cet aperçu en texte simple.
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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
          const isOpen = openId === article.id;
          return (
            <div key={article.id} className="rounded-md border bg-background">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : article.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              >
                <span className="font-medium">{article.title}</span>
                {isOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
              {isOpen && (
                <p className="whitespace-pre-wrap border-t px-3 py-2 text-sm text-muted-foreground">
                  {stripHtml(article.content)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
