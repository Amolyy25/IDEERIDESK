import { getArticleTemplates } from "@/lib/actions/knowledge-base";
import { TemplatesTable } from "@/components/knowledge-base/templates-table";

export default async function ArticleTemplatesPage() {
  const templates = await getArticleTemplates();

  return <TemplatesTable templates={templates} />;
}
