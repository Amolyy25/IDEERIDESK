import { auth } from "@/auth";
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
  const logoUrl = process.env.APP_URL ? `${process.env.APP_URL}/logoIdeeri.jpeg` : null;

  return (
    <SettingsSection href={HREF}>
      <AcknowledgementTemplateForm template={template} logoUrl={logoUrl} />
    </SettingsSection>
  );
}
