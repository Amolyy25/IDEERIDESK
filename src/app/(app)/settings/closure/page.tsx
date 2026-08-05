import { getBrandLogoUrl } from "@/lib/brand-logo";
import { getClosureTemplate } from "@/lib/actions/closure-settings";
import { ClosureTemplateForm } from "@/components/settings/closure/closure-template-form";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/closure";

export default async function ClosureSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const template = await getClosureTemplate();
  // Même logo qu'à l'envoi réel (Paramètres > Général) : ce que l'admin
  // insère dans le modèle est exactement ce que le client recevra.
  const logoUrl = await getBrandLogoUrl();

  return (
    <SettingsSection href={HREF}>
      <ClosureTemplateForm template={template} logoUrl={logoUrl} />
    </SettingsSection>
  );
}
