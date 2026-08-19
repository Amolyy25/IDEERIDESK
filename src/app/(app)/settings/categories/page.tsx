import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCategoryDeletionImpacts } from "@/lib/ticket-attribute-deletion";
import { CategoriesTable } from "@/components/settings/categories/categories-table";
import { CategoryDialog } from "@/components/settings/categories/category-dialog";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/categories";

export default async function CategoriesSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [categories, impacts] = await Promise.all([
    getTicketCategories(),
    getCategoryDeletionImpacts(),
  ]);

  return (
    <SettingsSection
      href={HREF}
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
      <CategoriesTable categories={categories} impacts={impacts} />
    </SettingsSection>
  );
}
