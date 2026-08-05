import { requirePageAccess } from "@/lib/require-page-access";
import { getArticleTemplates } from "@/lib/actions/knowledge-base";
import { TemplatesTable } from "@/components/knowledge-base/templates-table";

export default async function ArticleTemplatesPage() {
  await requirePageAccess("kb.manage");

  const templates = await getArticleTemplates();

  return <TemplatesTable templates={templates} />;
}
