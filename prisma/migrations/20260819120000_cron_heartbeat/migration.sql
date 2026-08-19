-- Battement des tâches planifiées.
--
-- L'ordonnanceur est un service Railway distinct : s'il tombe, ou si l'app
-- répond 502 pendant un redéploiement, aucun code applicatif ne tourne pour le
-- signaler. Cette table porte la seule preuve exploitable — la date du dernier
-- passage sain, comparée à l'intervalle attendu au moment où un agent charge
-- l'application (voir src/lib/cron-heartbeat.ts).
CREATE TABLE "cron_heartbeats" (
    "job" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastDetail" TEXT,
    "alertedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_heartbeats_pkey" PRIMARY KEY ("job")
);

-- Ligne posée dès la migration, avec un dernier succès fictif à maintenant : si
-- l'ordonnanceur ne rappelle jamais après ce déploiement, l'alerte tombe au
-- bout du délai de silence. Sans cette ligne, un cron supprimé par erreur
-- resterait invisible, faute de quoi que ce soit à comparer.
INSERT INTO "cron_heartbeats" ("job", "lastRunAt", "lastSuccessAt", "updatedAt")
VALUES ('antivirus', NOW(), NOW(), NOW())
ON CONFLICT ("job") DO NOTHING;

-- Panne d'un service de fond, signalée dans la cloche de tous les agents.
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ALERT';
