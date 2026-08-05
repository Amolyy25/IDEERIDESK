import { getAutomationRules } from "@/lib/actions/automations";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { AutomationRulesTable } from "@/components/settings/automations/automation-rules-table";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/automations";

export default async function AutomationsSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [rules, statuses] = await Promise.all([getAutomationRules(), getTicketStatuses()]);

  return (
    <SettingsSection href={HREF}>
      <AutomationRulesTable rules={rules} statuses={statuses} />
    </SettingsSection>
  );
}
