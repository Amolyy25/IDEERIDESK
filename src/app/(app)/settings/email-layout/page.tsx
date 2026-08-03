import { auth } from "@/auth";
import { getEmailLayout } from "@/lib/actions/email-layout";
import { DEFAULT_EMAIL_LAYOUT_HTML } from "@/lib/email-layout";
import { EmailLayoutForm } from "@/components/settings/email-layout/email-layout-form";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/email-layout";

export default async function EmailLayoutSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const template = await getEmailLayout();

  return (
    <SettingsSection href={HREF}>
      <EmailLayoutForm
        savedHtml={template?.html ?? null}
        defaultHtml={DEFAULT_EMAIL_LAYOUT_HTML}
      />
    </SettingsSection>
  );
}
