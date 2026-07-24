import { notFound } from "next/navigation";
import {
  getKnowledgeArticleById,
  getKnowledgeCategories,
  getArticleTemplates,
} from "@/lib/actions/knowledge-base";
import { ArticleForm } from "@/components/knowledge-base/article-form";

export default async function EditKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [article, categories, templates] = await Promise.all([
    getKnowledgeArticleById(id),
    getKnowledgeCategories(),
    getArticleTemplates(),
  ]);

  if (!article) {
    notFound();
  }

  return <ArticleForm article={article} categories={categories} templates={templates} />;
}
