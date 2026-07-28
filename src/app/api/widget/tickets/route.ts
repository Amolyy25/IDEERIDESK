import { NextRequest, NextResponse } from "next/server";
import {
  WidgetValidationError,
  createWidgetTicket,
  parseWidgetFormRequest,
} from "@/lib/widget";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// Route publique qui écrit en base (jusqu'à 4 pièces jointes de 5 Mo par appel)
// et déclenche un email par ticket : sans plafond, une boucle sature le stockage
// et le quota d'envoi, et fait blacklister l'adresse support.
const TICKETS_PER_HOUR = 10;

export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, "widget-ticket"), TICKETS_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de demandes envoyées depuis cette adresse. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = await parseWidgetFormRequest(formData);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const ticket = await createWidgetTicket(parsed.data, parsed.attachments, "WIDGET_PAPAIRIS");
    return NextResponse.json({ id: ticket.id, number: ticket.number }, { status: 201 });
  } catch (error) {
    if (error instanceof WidgetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Impossible de créer le ticket pour le moment." },
      { status: 500 }
    );
  }
}
