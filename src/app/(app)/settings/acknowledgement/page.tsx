import { auth } from "@/auth";
import { getBrandLogoUrl } from "@/lib/brand-logo";
import { getAcknowledgementTemplate } from "@/lib/actions/acknowledgement-settings";
import { AcknowledgementTemplateForm } from "@/components/settings/acknowledgement/acknowledgement-template-form";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/acknowledgement";

export default async function AcknowledgementSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const template = await getAcknowledgementTemplate();
  // Même logo qu'à l'envoi réel (Paramètres > Général) : ce que l'admin
  // insère dans le modèle est exactement ce que le client recevra.
  const logoUrl = await getBrandLogoUrl();

  return (
    <SettingsSection href={HREF}>
      <AcknowledgementTemplateForm template={template} logoUrl={logoUrl} />
    </SettingsSection>
  );
}
