import { auth } from "@/auth";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { PortalSettingsForm } from "@/components/settings/portal/portal-settings-form";

export default async function PortalSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Cette page est réservée aux administrateurs.
      </p>
    );
  }

  const settings = await getPortalSettings();

  return <PortalSettingsForm settings={settings} />;
}
