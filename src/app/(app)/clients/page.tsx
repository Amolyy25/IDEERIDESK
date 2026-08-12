import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";
import { getClients } from "@/lib/actions/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { ClientDuplicatesPanel } from "@/components/clients/client-duplicates-panel";

export default async function ClientsPage() {
  const session = await requirePageAccess("clients.view");
  const clients = await getClients();
  const canMerge = can(session.user.permissions, "clients.merge");

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Contacts à l&apos;origine des tickets.
          </p>
        </div>
        {can(session.user.permissions, "clients.manage") && <NewClientDialog />}
      </div>

      {/* Les rapprochements ne s'affichent qu'à qui peut les traiter : proposer
          une fusion à un agent qui ne l'a pas en permission serait un bandeau
          quotidien sans issue. La détection tourne sur la liste ci-dessous,
          aucune requête de plus. */}
      {canMerge && <ClientDuplicatesPanel clients={clients} />}

      <ClientsTable
        clients={clients}
        canDelete={can(session.user.permissions, "clients.delete")}
        canMerge={canMerge}
        canViewTickets={can(session.user.permissions, "tickets.view")}
        canExportPersonalData={can(session.user.permissions, "privacy.manage")}
      />
    </div>
  );
}
