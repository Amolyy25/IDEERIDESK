-- Priorité et délai en minutes dans les règles automatiques.
--
-- Une règle ne savait viser qu'un statut, avec un délai en jours entiers.
-- « Un ticket nouveau et urgent sans réponse depuis 4 h passe en retard » était
-- donc inexprimable deux fois : ni les 4 h, ni la restriction aux urgents.
--
-- Uniquement additif : `delayDays` reste en place pour que le code déjà déployé
-- continue de tourner pendant que la nouvelle version monte. Sa suppression est
-- dans la migration suivante.

-- Liste vide = toutes les priorités, ce qui est le comportement des règles
-- existantes : la migration ne change aucun périmètre.
ALTER TABLE "automation_rules"
    ADD COLUMN "triggerPriorityIds" TEXT[] NOT NULL DEFAULT '{}';

-- 4320 = 3 jours, l'ancien défaut, pour que les lignes déjà en base gardent
-- exactement leur délai le temps de la conversion ci-dessous.
ALTER TABLE "automation_rules"
    ADD COLUMN "delayMinutes" INTEGER NOT NULL DEFAULT 4320;

UPDATE "automation_rules"
SET "delayMinutes" = "delayDays" * 1440;
