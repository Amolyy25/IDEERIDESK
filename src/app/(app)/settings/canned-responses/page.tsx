import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCannedResponses, getFilterDimensions } from "@/lib/actions/canned-responses";
import { CannedResponsesTable } from "@/components/settings/canned-responses/canned-responses-table";
import { CannedResponseDialog } from "@/components/settings/canned-responses/canned-response-dialog";
import {
  SettingsNoAccess,
  SettingsSection,
  canOpenSettings,
} from "@/components/settings/settings-section";

const HREF = "/settings/canned-responses";

export default async function CannedResponsesSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  // Les dimensions viennent du registre (src/lib/canned-responses.ts) avec leurs
  // valeurs actuelles : le formulaire et la liste ne connaissent aucun critère à
  // l'avance, ils affichent ce que le registre leur donne.
  const [responses, dimensions] = await Promise.all([
    getCannedResponses(),
    getFilterDimensions(),
  ]);

  return (
    <SettingsSection
      href={HREF}
      action={
        <CannedResponseDialog
          dimensions={dimensions}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle réponse
            </Button>
          }
        />
      }
    >
      <CannedResponsesTable responses={responses} dimensions={dimensions} />
    </SettingsSection>
  );
}
