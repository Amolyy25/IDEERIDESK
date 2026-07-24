import { getTicketPriorities } from "@/lib/actions/priorities";
import { PrioritiesTable } from "@/components/settings/priorities/priorities-table";

export default async function PrioritiesSettingsPage() {
  const priorities = await getTicketPriorities();

  return <PrioritiesTable priorities={priorities} />;
}
