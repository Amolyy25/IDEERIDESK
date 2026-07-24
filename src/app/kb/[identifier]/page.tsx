import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getArticleByShareToken, getKnowledgeArticleBySlug } from "@/lib/actions/knowledge-base";
import { ArticleContent } from "@/components/knowledge-base/article-content";

// Une seule URL publique pour tout lire, `/kb/...` — accepte soit le slug de
// l'article (lien inséré depuis un autre article, toujours réservé aux
// agents connectés : ce n'est pas un partage volontaire), soit un vrai
// shareToken généré via le bouton "Partager" (respecte alors PUBLIC/INTERNAL
// choisi à ce moment-là). Un slug ne contourne jamais la restriction d'un
// partage non activé — sinon deviner le slug suffirait à lire un article
// jamais partagé.
export default async function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;

  const shared = await getArticleByShareToken(identifier);
  if (shared) {
    if (shared.shareScope === "INTERNAL") {
      const session = await auth();
      if (!session?.user?.id) redirect("/login");
    }
    return (
      <div className="min-h-screen bg-background p-6 text-foreground sm:p-10">
        <ArticleContent title={shared.title} html={shared.content} />
      </div>
    );
  }

  const article = await getKnowledgeArticleBySlug(identifier);
  if (!article) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground sm:p-10">
      <ArticleContent title={article.title} html={article.content} />
    </div>
  );
}
