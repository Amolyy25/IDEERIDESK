import { auth } from "@/auth";
import { getAllAgents } from "@/lib/actions/agents";
import { getGroups } from "@/lib/actions/groups";
import { getTicketCategories } from "@/lib/actions/categories";
import { GroupsSection } from "@/components/agents/groups-section";
import { AgentsTable } from "@/components/agents/agents-table";
import { Separator } from "@/components/ui/separator";

export default async function AgentsPage() {
  const [session, agents, groups, categories] = await Promise.all([
    auth(),
    getAllAgents(),
    getGroups(),
    getTicketCategories(),
  ]);

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Équipe</h1>
        <p className="text-sm text-muted-foreground">
          Groupes de support et permissions des agents.
          {!isAdmin && " Consultation seule — contactez un administrateur pour modifier."}
        </p>
      </div>

      <GroupsSection
        groups={groups}
        agents={agents}
        categories={categories}
        isAdmin={isAdmin}
      />

      <Separator />

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Agents</h2>
        <AgentsTable agents={agents} currentAgentId={session?.user?.id ?? ""} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
