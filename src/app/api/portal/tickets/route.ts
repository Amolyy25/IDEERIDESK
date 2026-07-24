import { NextRequest, NextResponse } from "next/server";
import {
  WidgetValidationError,
  createWidgetTicket,
  parseWidgetFormRequest,
} from "@/lib/widget";

export async function POST(request: NextRequest) {
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
    const ticket = await createWidgetTicket(parsed.data, parsed.attachments, "PORTAL");
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
