import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { getSources } from "@/lib/actions/sources";
import { SourcesList } from "@/components/settings/sources/sources-list";
import { SourceCreateDialog } from "@/components/settings/sources/source-create-dialog";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/sources";

export default async function SourcesSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const sources = await getSources();

  return (
    <SettingsSection
      href={HREF}
      action={
        <SourceCreateDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Créer une source
            </Button>
          }
        />
      }
    >
      {/* APP_URL est la seule source fiable de l'URL publique réelle (cf. la
          reprise OAuth Gmail) : le code d'intégration doit être copiable tel quel. */}
      <SourcesList sources={sources} origin={process.env.APP_URL ?? ""} />
    </SettingsSection>
  );
}
