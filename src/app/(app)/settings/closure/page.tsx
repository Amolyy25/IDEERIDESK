import { auth } from "@/auth";
import { getBrandLogoUrl } from "@/lib/brand-logo";
import { getClosureTemplate } from "@/lib/actions/closure-settings";
import { ClosureTemplateForm } from "@/components/settings/closure/closure-template-form";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/closure";

export default async function ClosureSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
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
