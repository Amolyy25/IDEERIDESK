import { getGlobalSettings } from "@/lib/actions/settings";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";

export default async function GeneralSettingsPage() {
  const settings = await getGlobalSettings();

  return <GeneralSettingsForm settings={settings} />;
}
