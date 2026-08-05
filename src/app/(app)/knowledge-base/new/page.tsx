import { requirePageAccess } from "@/lib/require-page-access";
import {
  getKnowledgeCategories,
  getArticleTemplates,
  getKnowledgeArticles,
} from "@/lib/actions/knowledge-base";
import { ArticleForm } from "@/components/knowledge-base/article-form";

export default async function NewKnowledgeArticlePage() {
  await requirePageAccess("kb.manage");

  const [categories, templates, allArticles] = await Promise.all([
    getKnowledgeCategories(),
    getArticleTemplates(),
    getKnowledgeArticles(),
  ]);

  return <ArticleForm categories={categories} templates={templates} allArticles={allArticles} />;
}
