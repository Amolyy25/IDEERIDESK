import { NextRequest, NextResponse } from "next/server";
import { runAutomations } from "@/lib/automations";

/**
 * Meant to be called on a schedule (external cron, same pattern as
 * `/api/gmail/sync`) to apply automation rules (ex: fermeture automatique
 * des tickets inactifs). Protected by a shared secret since it mutates data.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_AUTOMATIONS_SECRET;
  const provided = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await runAutomations();
  return NextResponse.json(result);
}
