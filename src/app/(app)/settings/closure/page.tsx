import { auth } from "@/auth";
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
  const logoUrl = process.env.APP_URL ? `${process.env.APP_URL}/logoIdeeri.jpeg` : null;

  return (
    <SettingsSection href={HREF}>
      <ClosureTemplateForm template={template} logoUrl={logoUrl} />
    </SettingsSection>
  );
}
