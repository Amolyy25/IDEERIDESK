import { getKnowledgeArticles } from "@/lib/actions/knowledge-base";
import { ArticlesTable } from "@/components/knowledge-base/articles-table";
import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";

export default async function KnowledgeBaseArticlesPage() {
  const session = await requirePageAccess("kb.view");
  const articles = await getKnowledgeArticles();

  return (
    <ArticlesTable
      articles={articles}
      canManage={can(session.user.permissions, "kb.manage")}
    />
  );
}
