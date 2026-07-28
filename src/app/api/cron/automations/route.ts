import { NextRequest, NextResponse } from "next/server";
import { runAutomations } from "@/lib/automations";
import { hasValidCronSecret } from "@/lib/cron-secret";

/**
 * Meant to be called on a schedule (external cron, same pattern as
 * `/api/gmail/sync`) to apply automation rules (ex: fermeture automatique
 * des tickets inactifs). Protected by a shared secret since it mutates data —
 * transmis par en-tête `x-cron-secret` uniquement (voir `hasValidCronSecret`).
 */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request, "x-cron-secret", process.env.CRON_AUTOMATIONS_SECRET)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await runAutomations();
  return NextResponse.json(result);
}
