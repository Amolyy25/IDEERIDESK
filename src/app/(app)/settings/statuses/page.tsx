import { getTicketStatuses } from "@/lib/actions/statuses";
import { StatusesTable } from "@/components/settings/statuses/statuses-table";

export default async function StatusesSettingsPage() {
  const statuses = await getTicketStatuses();

  return <StatusesTable statuses={statuses} />;
}
