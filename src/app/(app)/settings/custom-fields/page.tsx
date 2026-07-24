import { getCustomFields } from "@/lib/actions/custom-fields";
import { CustomFieldsTable } from "@/components/settings/custom-fields/custom-fields-table";

export default async function CustomFieldsSettingsPage() {
  const fields = await getCustomFields();

  return <CustomFieldsTable fields={fields} />;
}
