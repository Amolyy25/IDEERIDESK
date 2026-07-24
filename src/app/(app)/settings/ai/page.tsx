import { auth } from "@/auth";
import { getAiSettingsStatus } from "@/lib/actions/ai-settings";
import { AiSettingsForm } from "@/components/settings/ai/ai-settings-form";

export default async function AiSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Cette page est réservée aux administrateurs.
      </p>
    );
  }

  const status = await getAiSettingsStatus();

  return <AiSettingsForm status={status} />;
}
