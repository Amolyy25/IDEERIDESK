"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";

type FaqArticle = { id: string; title: string; slug: string; excerpt: string | null };
type FaqGroup = { id: string; name: string; articles: FaqArticle[] };

export function FaqBrowser({
  groups,
  searchEnabled = true,
  ctaLabel = "Créer un ticket",
}: {
  groups: FaqGroup[];
  searchEnabled?: boolean;
  ctaLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        articles: group.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            (a.excerpt?.toLowerCase().includes(q) ?? false),
        ),
      }))
      .filter((group) => group.articles.length > 0);
  }, [groups, query]);

  const total = filtered.reduce((sum, g) => sum + g.articles.length, 0);

  return (
    <div>
      <div className={searchEnabled ? "relative mb-8" : "hidden"}>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une question…"
          aria-label="Rechercher dans la FAQ"
          className="h-12 w-full rounded-xl border bg-card pl-11 pr-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium">Aucune réponse ne correspond à « {query} »</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez un ticket, notre équipe vous répond directement.
          </p>
          <Link
            href="/nouveau-ticket"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {ctaLabel}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {filtered.map((group) => (
            <section key={group.id}>
              <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {group.name}
              </h3>
              <div className="overflow-hidden rounded-xl border bg-card">
                {group.articles.map((article, i) => (
                  <Link
                    key={article.id}
                    href={`/faq/${article.slug}`}
                    className={`group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-primary/5 ${
                      i > 0 ? "border-t" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{article.title}</p>
                      {article.excerpt && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
