import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { getPriorityDeletionImpacts } from "@/lib/ticket-attribute-deletion";
import { PrioritiesTable } from "@/components/settings/priorities/priorities-table";
import { PriorityDialog } from "@/components/settings/priorities/priority-dialog";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/priorities";

export default async function PrioritiesSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const [priorities, impacts] = await Promise.all([
    getTicketPriorities(),
    getPriorityDeletionImpacts(),
  ]);

  return (
    <SettingsSection
      href={HREF}
      action={
        <PriorityDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle priorité
            </Button>
          }
        />
      }
    >
      <PrioritiesTable priorities={priorities} impacts={impacts} />
    </SettingsSection>
  );
}
