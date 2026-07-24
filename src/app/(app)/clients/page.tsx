import { getClients } from "@/lib/actions/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Contacts à l&apos;origine des tickets.
          </p>
        </div>
        <NewClientDialog />
      </div>

      <ClientsTable clients={clients} />
    </div>
  );
}
