import { getKnowledgeArticles } from "@/lib/actions/knowledge-base";
import { ArticlesTable } from "@/components/knowledge-base/articles-table";

export default async function KnowledgeBaseArticlesPage() {
  const articles = await getKnowledgeArticles();

  return <ArticlesTable articles={articles} />;
}
