import { requirePageAccess } from "@/lib/require-page-access";
import { getKnowledgeCategories } from "@/lib/actions/knowledge-base";
import { CategoriesTable } from "@/components/knowledge-base/categories-table";

export default async function KnowledgeCategoriesPage() {
  await requirePageAccess("kb.manage");

  const categories = await getKnowledgeCategories();

  return <CategoriesTable categories={categories} />;
}
