import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { searchTickets } from "@/lib/ticket-search";

// Recherche de la palette (⌘K). Route GET et NON Server Action : Next sérialise
// les actions (chacune attend la précédente) et rejoue le rendu de la page — à la
// frappe, le retard s'accumule. Un GET est parallèle, annulable, et ne coûte que
// sa requête SQL.
export async function GET(request: NextRequest) {
  try {
    await requirePermission("tickets.view");
  } catch {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const hits = await searchTickets(request.nextUrl.searchParams.get("q") ?? "");

  return NextResponse.json(
    { hits },
    // Des sujets et des noms de clients : rien qui ait à rester dans un cache.
    { headers: { "cache-control": "private, no-store" } }
  );
}
