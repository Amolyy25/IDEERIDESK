import { auth } from "@/auth";
import { getAutomationRules } from "@/lib/actions/automations";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { AutomationRulesTable } from "@/components/settings/automations/automation-rules-table";

export default async function AutomationsSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Cette page est réservée aux administrateurs.
      </p>
    );
  }

  const [rules, statuses] = await Promise.all([getAutomationRules(), getTicketStatuses()]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Automatisez des actions récurrentes, par exemple fermer un ticket resté trop longtemps
        dans un statut donné (ex. « En attente client »).
      </p>
      <AutomationRulesTable rules={rules} statuses={statuses} />
    </div>
  );
}
