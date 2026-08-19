import { prisma } from "@/lib/prisma";

// Suivi des tâches déclenchées par l'ordonnanceur externe. Une tâche qui ne
// s'exécute pas ne peut pas signaler son échec — le 502 d'un redéploiement
// n'atteint jamais le code d'ici. D'où la lecture à l'envers, sur l'ancienneté
// du dernier passage sain.

export type CronJob = "antivirus";

export type CronHeartbeat = {
  job: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastDetail: string | null;
  alertedAt: Date | null;
};

export async function recordCronRun(job: CronJob, outcome: { ok: boolean; detail?: string | null }) {
  const now = new Date();

  await prisma.cronHeartbeat.upsert({
    where: { job },
    create: {
      job,
      lastRunAt: now,
      lastSuccessAt: outcome.ok ? now : null,
      lastDetail: outcome.ok ? null : (outcome.detail ?? null),
    },
    update: outcome.ok
      ? { lastRunAt: now, lastSuccessAt: now, lastDetail: null, alertedAt: null }
      : { lastRunAt: now, lastDetail: outcome.detail ?? null },
  });
}

export function readCronHeartbeat(job: CronJob): Promise<CronHeartbeat | null> {
  return prisma.cronHeartbeat.findUnique({
    where: { job },
    select: {
      job: true,
      lastRunAt: true,
      lastSuccessAt: true,
      lastDetail: true,
      alertedAt: true,
    },
  });
}

// Réserve le droit de notifier l'épisode en cours. `alertedAt: null` dans le
// WHERE et pas dans un `if` : plusieurs agents relèvent leur cloche en même
// temps, seul celui dont l'update touche une ligne envoie la salve.
export async function claimCronAlert(job: CronJob) {
  const claimed = await prisma.cronHeartbeat.updateMany({
    where: { job, alertedAt: null },
    data: { alertedAt: new Date() },
  });
  return claimed.count === 1;
}
