import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { getBrandLogoUrl } from "@/lib/brand-logo";
import { Button } from "@/components/ui/button";
import { getEmailSignatures } from "@/lib/actions/signatures";
import { getAgents } from "@/lib/actions/agents";
import { SignaturesTable } from "@/components/settings/signatures/signatures-table";
import { SignatureDialog } from "@/components/settings/signatures/signature-dialog";
import { SettingsAdminOnly, SettingsSection } from "@/components/settings/settings-section";

const HREF = "/settings/signatures";

export default async function SignaturesSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href={HREF} />;
  }

  const [signatures, agents] = await Promise.all([getEmailSignatures(), getAgents()]);
  // Seul ce dont le formulaire a besoin : la table `agents` porte aussi des
  // permissions et des dates, inutiles dans une liste à cocher.
  const agentOptions = agents.map((agent) => ({ id: agent.id, name: agent.name }));
  // Même logo qu'à l'envoi réel (Paramètres > Général) : ce que l'admin
  // insère dans le modèle est exactement ce que le client recevra.
  const logoUrl = await getBrandLogoUrl();

  return (
    <SettingsSection
      href={HREF}
      action={
        <SignatureDialog
          agents={agentOptions}
          logoUrl={logoUrl}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle signature
            </Button>
          }
        />
      }
    >
      <SignaturesTable signatures={signatures} agents={agentOptions} logoUrl={logoUrl} />
    </SettingsSection>
  );
}
