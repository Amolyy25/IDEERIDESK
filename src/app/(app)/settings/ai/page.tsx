import { getAiSettingsStatus } from "@/lib/actions/ai-settings";
import { AiSettingsForm } from "@/components/settings/ai/ai-settings-form";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/ai";

export default async function AiSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const status = await getAiSettingsStatus();

  return (
    <SettingsSection href={HREF}>
      <AiSettingsForm status={status} />
    </SettingsSection>
  );
}
