import { getAutomationRules } from "@/lib/actions/automations";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getTicketCategories } from "@/lib/actions/categories";
import { getAgents } from "@/lib/actions/agents";
import { getGroups } from "@/lib/actions/groups";
import { getCannedResponses } from "@/lib/actions/canned-responses";
import { AutomationRulesTable } from "@/components/settings/automations/automation-rules-table";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/automations";

export default async function AutomationsSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [rules, statuses, priorities, categories, agents, groups, cannedResponses] =
    await Promise.all([
      getAutomationRules(),
      getTicketStatuses(),
      getTicketPriorities(),
      getTicketCategories(),
      getAgents(),
      getGroups(),
      getCannedResponses(),
    ]);

  return (
    <SettingsSection href={HREF}>
      <AutomationRulesTable
        rules={rules}
        statuses={statuses}
        priorities={priorities}
        categories={categories}
        agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        templates={cannedResponses
          .filter((response) => response.isActive)
          .map(({ id, title, body }) => ({ id, title, body }))}
      />
    </SettingsSection>
  );
}
