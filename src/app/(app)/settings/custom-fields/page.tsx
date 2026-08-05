import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { CustomFieldsTable } from "@/components/settings/custom-fields/custom-fields-table";
import { CustomFieldDialog } from "@/components/settings/custom-fields/custom-field-dialog";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/custom-fields";

export default async function CustomFieldsSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const fields = await getCustomFields();

  return (
    <SettingsSection
      href={HREF}
      action={
        <CustomFieldDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouveau champ
            </Button>
          }
        />
      }
    >
      <CustomFieldsTable fields={fields} />
    </SettingsSection>
  );
}
