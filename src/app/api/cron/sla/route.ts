import { NextRequest, NextResponse } from "next/server";
import { runSlaWarnings } from "@/lib/sla-warnings";
import { hasValidCronSecret } from "@/lib/cron-secret";

/**
 * Alerte « échéance SLA imminente », à appeler sur une planification (même
 * modèle que `/api/cron/automations`). Protégée par un secret partagé puisqu'elle
 * mute des tickets et envoie des emails — transmis par en-tête `x-cron-secret`
 * uniquement, jamais dans l'URL (voir `hasValidCronSecret`).
 *
 * Cadence conseillée : toutes les 5 minutes. Elle borne la précision de l'alerte
 * — un battement toutes les heures avec un préavis de 30 minutes laisserait
 * passer des échéances sans avertir personne.
 */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request, "x-cron-secret", process.env.CRON_SLA_SECRET)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await runSlaWarnings();
  return NextResponse.json(result);
}
