import { auth } from "@/auth";
import { getAiSettingsStatus } from "@/lib/actions/ai-settings";
import { AiSettingsForm } from "@/components/settings/ai/ai-settings-form";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/ai";

export default async function AiSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const status = await getAiSettingsStatus();

  return (
    <SettingsSection href={HREF}>
      <AiSettingsForm status={status} />
    </SettingsSection>
  );
}
