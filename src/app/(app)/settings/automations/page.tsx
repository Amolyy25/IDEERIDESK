import { auth } from "@/auth";
import { getAutomationRules } from "@/lib/actions/automations";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { AutomationRulesTable } from "@/components/settings/automations/automation-rules-table";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/automations";

export default async function AutomationsSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const [rules, statuses] = await Promise.all([getAutomationRules(), getTicketStatuses()]);

  return (
    <SettingsSection href={HREF}>
      <AutomationRulesTable rules={rules} statuses={statuses} />
    </SettingsSection>
  );
}
