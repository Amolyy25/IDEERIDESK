import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { StatusesTable } from "@/components/settings/statuses/statuses-table";
import { StatusDialog } from "@/components/settings/statuses/status-dialog";
import { SettingsSection } from "@/components/settings/settings-section";

export default async function StatusesSettingsPage() {
  const statuses = await getTicketStatuses();

  return (
    <SettingsSection
      href="/settings/statuses"
      action={
        <StatusDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouveau statut
            </Button>
          }
        />
      }
    >
      <StatusesTable statuses={statuses} />
    </SettingsSection>
  );
}
