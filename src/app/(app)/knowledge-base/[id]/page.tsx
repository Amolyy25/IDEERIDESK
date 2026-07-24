import { notFound } from "next/navigation";
import {
  getKnowledgeArticleById,
  getKnowledgeCategories,
  getArticleTemplates,
  getKnowledgeArticles,
} from "@/lib/actions/knowledge-base";
import { ArticleForm } from "@/components/knowledge-base/article-form";

export default async function EditKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [article, categories, templates, allArticles] = await Promise.all([
    getKnowledgeArticleById(id),
    getKnowledgeCategories(),
    getArticleTemplates(),
    getKnowledgeArticles(),
  ]);

  if (!article) {
    notFound();
  }

  return (
    <ArticleForm
      article={article}
      categories={categories}
      templates={templates}
      allArticles={allArticles}
    />
  );
}
