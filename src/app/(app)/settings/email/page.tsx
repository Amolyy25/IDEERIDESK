import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { EmailSettingsPanel } from "@/components/settings/email/email-settings-panel";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/email";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [status, params] = await Promise.all([getEmailAccountStatus(), searchParams]);

  return (
    <SettingsSection href={HREF}>
      <EmailSettingsPanel
        status={status}
        justConnected={params.connected === "1"}
        oauthError={params.error ?? null}
      />
    </SettingsSection>
  );
}
