import { NextRequest, NextResponse } from "next/server";
import { rescanPendingFiles } from "@/lib/antivirus-rescan";
import { hasValidCronSecret } from "@/lib/cron-secret";

/**
 * Reprise des fichiers restés en attente d'analyse — même schéma que
 * `/api/cron/automations` : ordonnanceur externe, secret partagé en en-tête.
 *
 * À appeler régulièrement (toutes les 15 minutes convient) : c'est la
 * contrepartie du choix de ne pas bloquer un téléversement quand le scanner est
 * injoignable. Sans ce passage, un fichier entré pendant une panne de clamd
 * resterait non analysé indéfiniment.
 *
 * Le premier passage après déploiement traite tout le stock antérieur à la mise
 * en place de l'analyse (voir la migration) : prévoir plusieurs passages, le
 * travail est plafonné par exécution.
 */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request, "x-cron-secret", process.env.CRON_ANTIVIRUS_SECRET)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const report = await rescanPendingFiles();
  return NextResponse.json(report);
}
