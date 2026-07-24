import { getKnowledgeCategories, getArticleTemplates } from "@/lib/actions/knowledge-base";
import { ArticleForm } from "@/components/knowledge-base/article-form";

export default async function NewKnowledgeArticlePage() {
  const [categories, templates] = await Promise.all([
    getKnowledgeCategories(),
    getArticleTemplates(),
  ]);

  return <ArticleForm categories={categories} templates={templates} />;
}
