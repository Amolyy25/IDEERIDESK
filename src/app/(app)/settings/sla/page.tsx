import { getSlaSettings } from "@/lib/actions/sla";
import { SlaSettingsForm } from "@/components/settings/sla/sla-settings-form";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/sla";

export default async function SlaSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const settings = await getSlaSettings();

  return (
    <SettingsSection href={HREF}>
      <SlaSettingsForm settings={settings} />
    </SettingsSection>
  );
}
