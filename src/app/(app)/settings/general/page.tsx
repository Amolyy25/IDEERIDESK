import { getGlobalSettings } from "@/lib/actions/settings";
import { getBrandLogoStatus } from "@/lib/actions/brand-logo";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";
import { BrandLogoForm } from "@/components/settings/brand-logo-form";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/general";

export default async function GeneralSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [settings, brandLogo] = await Promise.all([getGlobalSettings(), getBrandLogoStatus()]);

  return (
    <SettingsSection href={HREF}>
      <div className="space-y-8">
        {/* Le logo en tête de section : c'est le seul réglage de cette page qui
            se voit chez le client, les autres sont des valeurs de texte. */}
        <BrandLogoForm status={brandLogo} />
        <GeneralSettingsForm settings={settings} />
      </div>
    </SettingsSection>
  );
}
