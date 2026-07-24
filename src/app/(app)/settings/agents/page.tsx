import { auth } from "@/auth";
import { getAllAgents } from "@/lib/actions/agents";
import { AgentsTable } from "@/components/settings/agents/agents-table";

export default async function AgentsSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Cette page est réservée aux administrateurs.
      </p>
    );
  }

  const agents = await getAllAgents();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gérez qui a accès au support et ce que chaque agent peut faire. Un agent sans
        « Peut répondre » a un accès en lecture seule. Un agent avec « Validation requise »
        voit ses réponses publiques bloquées jusqu&apos;à ce qu&apos;un agent « Peut valider »
        les approuve.
      </p>
      <AgentsTable agents={agents} currentAgentId={session.user.id} />
    </div>
  );
}
