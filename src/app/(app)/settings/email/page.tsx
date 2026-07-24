import { auth } from "@/auth";
import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { EmailSettingsPanel } from "@/components/settings/email/email-settings-panel";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [session, status, params] = await Promise.all([
    auth(),
    getEmailAccountStatus(),
    searchParams,
  ]);

  return (
    <EmailSettingsPanel
      status={status}
      isAdmin={session?.user?.role === "ADMIN"}
      justConnected={params.connected === "1"}
      oauthError={params.error ?? null}
    />
  );
}
