import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTicketPriorities } from "@/lib/actions/priorities";
import { PrioritiesTable } from "@/components/settings/priorities/priorities-table";
import { PriorityDialog } from "@/components/settings/priorities/priority-dialog";
import { SettingsSection } from "@/components/settings/settings-section";

export default async function PrioritiesSettingsPage() {
  const priorities = await getTicketPriorities();

  return (
    <SettingsSection
      href="/settings/priorities"
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
      <PrioritiesTable priorities={priorities} />
    </SettingsSection>
  );
}
