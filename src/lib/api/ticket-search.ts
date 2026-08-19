import type { TicketSearchHit } from "@/lib/ticket-search";

// Appels réseau de la palette de recherche.

export async function fetchTicketSearch(
  term: string,
  signal: AbortSignal
): Promise<TicketSearchHit[]> {
  const response = await fetch(`/api/tickets/search?q=${encodeURIComponent(term)}`, { signal });
  const parsed = await response.json().catch(() => null);
  if (!response.ok) throw new Error(parsed?.error ?? "Recherche impossible.");
  return (parsed?.hits ?? []) as TicketSearchHit[];
}
