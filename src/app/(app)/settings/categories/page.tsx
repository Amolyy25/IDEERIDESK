import { getTicketCategories } from "@/lib/actions/categories";
import { CategoriesTable } from "@/components/settings/categories/categories-table";

export default async function CategoriesSettingsPage() {
  const categories = await getTicketCategories();

  return <CategoriesTable categories={categories} />;
}
