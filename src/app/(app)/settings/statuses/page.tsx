import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketStatuses } from "@/lib/actions/statuses";
import { getStatusDeletionImpacts } from "@/lib/ticket-attribute-deletion";
import { StatusesTable } from "@/components/settings/statuses/statuses-table";
import { StatusDialog } from "@/components/settings/statuses/status-dialog";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/statuses";

export default async function StatusesSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [statuses, impacts] = await Promise.all([
    getTicketStatuses(),
    getStatusDeletionImpacts(),
  ]);

  return (
    <SettingsSection
      href={HREF}
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
      <StatusesTable statuses={statuses} impacts={impacts} />
    </SettingsSection>
  );
}
