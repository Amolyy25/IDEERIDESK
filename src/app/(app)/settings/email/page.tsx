import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { EmailSettingsPanel } from "@/components/settings/email/email-settings-panel";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [status, params] = await Promise.all([getEmailAccountStatus(), searchParams]);

  return (
    <EmailSettingsPanel
      status={status}
      justConnected={params.connected === "1"}
      oauthError={params.error ?? null}
    />
  );
}
