import { getKnowledgeCategories } from "@/lib/actions/knowledge-base";
import { CategoriesTable } from "@/components/knowledge-base/categories-table";

export default async function KnowledgeCategoriesPage() {
  const categories = await getKnowledgeCategories();

  return <CategoriesTable categories={categories} />;
}
