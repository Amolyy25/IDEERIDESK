import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { PortalSettingsForm } from "@/components/settings/portal/portal-settings-form";
import { SettingsNoAccess, SettingsSection, canOpenSettings } from "@/components/settings/settings-section";

const HREF = "/settings/portal";

export default async function PortalSettingsPage() {
  if (!(await canOpenSettings(HREF))) {
    return <SettingsNoAccess href={HREF} />;
  }

  const settings = await getPortalSettings();

  return (
    <SettingsSection
      href={HREF}
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/" target="_blank">
            <ExternalLink className="size-4" />
            Voir le portail
          </Link>
        </Button>
      }
    >
      <PortalSettingsForm settings={settings} />
    </SettingsSection>
  );
}
