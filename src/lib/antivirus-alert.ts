import { prisma } from "@/lib/prisma";
import { countPendingFiles } from "@/lib/antivirus-rescan";
import { claimCronAlert, readCronHeartbeat, type CronHeartbeat } from "@/lib/cron-heartbeat";
import { formatRelativeDate } from "@/lib/format-date";

// Passage quotidien, réessayé 5 fois à 10 min d'intervalle : au-delà de 26 h
// sans succès, ce n'est plus un redéploiement mal tombé mais une panne.
const MAX_SILENCE_MS = 26 * 60 * 60 * 1000;

// La cloche de chaque agent connecté passe ici toutes les 60 s : sans cette
// garde, le nombre de lectures du battement suit le nombre d'agents, pour un
// état qui ne bouge qu'une fois par jour. Posée avant l'await, donc dix cloches
// simultanées ne déclenchent qu'une lecture.
const CHECK_INTERVAL_MS = 60_000;
let nextCheckAt = 0;

export type AntivirusFailure = {
  /** `failed` : le passage a eu lieu et s'est mal terminé. `stalled` : plus de passage du tout. */
  kind: "failed" | "stalled";
  lastSuccessAt: Date | null;
  detail: string | null;
};

export function detectAntivirusFailure(
  heartbeat: CronHeartbeat | null,
  now = new Date(),
): AntivirusFailure | null {
  if (!heartbeat?.lastRunAt) return null;

  const { lastRunAt, lastSuccessAt, lastDetail } = heartbeat;

  if (!lastSuccessAt || lastRunAt > lastSuccessAt) {
    return { kind: "failed", lastSuccessAt, detail: lastDetail };
  }

  if (now.getTime() - lastSuccessAt.getTime() > MAX_SILENCE_MS) {
    return { kind: "stalled", lastSuccessAt, detail: lastDetail };
  }

  return null;
}

export function antivirusAlertMessage(failure: AntivirusFailure, pendingCount: number) {
  const cause =
    failure.kind === "failed"
      ? `Analyse antivirus en échec — ${failure.detail ?? "cause inconnue"}.`
      : `Analyse antivirus interrompue — dernier passage réussi ${
          failure.lastSuccessAt ? formatRelativeDate(failure.lastSuccessAt) : "jamais"
        }.`;

  if (pendingCount === 0) return `${cause} Les fichiers reçus depuis ne sont plus vérifiés.`;
  return `${cause} ${pendingCount} fichier${pendingCount > 1 ? "s" : ""} en attente d'analyse.`;
}

// Branché sur la lecture de la cloche : seul chemin qui tourne encore quand
// l'ordonnanceur, lui, ne répond plus.
//
// Pour la déclencher à la main :
//   UPDATE cron_heartbeats SET "lastSuccessAt" = NOW() - INTERVAL '3 days',
//          "alertedAt" = NULL WHERE job = 'antivirus';
// puis recharger — jusqu'à 60 s d'attente, voir CHECK_INTERVAL_MS.
export async function notifyAntivirusFailure() {
  if (Date.now() < nextCheckAt) return;
  nextCheckAt = Date.now() + CHECK_INTERVAL_MS;

  const failure = detectAntivirusFailure(await readCronHeartbeat("antivirus"));
  if (!failure) return;
  if (!(await claimCronAlert("antivirus"))) return;

  const [recipients, pendingCount] = await Promise.all([
    prisma.agent.findMany({
      where: { isActive: true, approvalStatus: "APPROVED", anonymizedAt: null },
      select: { id: true },
    }),
    countPendingFiles(),
  ]);

  await prisma.notification.createMany({
    data: recipients.map((recipient) => ({
      type: "SYSTEM_ALERT" as const,
      excerpt: antivirusAlertMessage(failure, pendingCount),
      recipientId: recipient.id,
    })),
  });
}
