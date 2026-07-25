import { auth } from "@/auth";
import { getGlobalSettings } from "@/lib/actions/settings";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/general";

export default async function GeneralSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const settings = await getGlobalSettings();

  return (
    <SettingsSection href={HREF}>
      <GeneralSettingsForm settings={settings} />
    </SettingsSection>
  );
}
