import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketCategories } from "@/lib/actions/categories";
import { CategoriesTable } from "@/components/settings/categories/categories-table";
import { CategoryDialog } from "@/components/settings/categories/category-dialog";
import { SettingsSection } from "@/components/settings/settings-section";

export default async function CategoriesSettingsPage() {
  const categories = await getTicketCategories();

  return (
    <SettingsSection
      href="/settings/categories"
      action={
        <CategoryDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouveau produit
            </Button>
          }
        />
      }
    >
      <CategoriesTable categories={categories} />
    </SettingsSection>
  );
}
