import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedArticlesByCategory } from "@/lib/actions/knowledge-base";

export const metadata: Metadata = {
  title: "FAQ — Ideeri",
};

// Liste d'articles publiés modifiable à tout moment depuis la base de
// connaissances — sans ça, Next préconstruit la page en statique et un
// nouvel article publié n'apparaît qu'au prochain déploiement.
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const { categories, uncategorized } = await getPublishedArticlesByCategory();
  const groups = [
    ...categories
      .filter((c) => c.articles.length > 0)
      .map((c) => ({ id: c.id, name: c.name, articles: c.articles })),
    ...(uncategorized.length > 0
      ? [{ id: "uncategorized", name: "Autres", articles: uncategorized }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logoIdeeri.jpeg" alt="Ideeri" width={100} height={26} className="h-6 w-auto" />
            <span className="text-sm font-medium text-muted-foreground">Support</span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Créer un ticket →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-semibold">Foire aux questions</h1>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun article disponible pour le moment.</p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.id}>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">{group.name}</h2>
                <div className="divide-y rounded-lg border">
                  {group.articles.map((article) => (
                    <Link
                      key={article.id}
                      href={`/faq/${article.slug}`}
                      className="block px-4 py-3 hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium">{article.title}</p>
                      {article.excerpt && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {article.excerpt}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
