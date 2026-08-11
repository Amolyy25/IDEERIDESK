-- Emails d'équipe : affectation, nouveau ticket dans sa file, échéance SLA
-- imminente.
--
-- Trois cases par agent, actives par défaut. Actives, parce qu'un agent qu'on
-- ajoute doit être au courant de ce qui arrive sur ses dossiers sans avoir à
-- réclamer un réglage ; débrayables une par une, parce qu'un agent noyé qui ne
-- peut couper qu'en bloc met une règle de filtrage sur l'expéditeur et cesse de
-- lire jusqu'aux mentions nominatives.
--
-- Les mentions « @Prénom » ne figurent pas ici : citer quelqu'un nommément est
-- une adresse directe, pas une diffusion, et ça ne se coupe pas.
ALTER TABLE "agents"
    ADD COLUMN "notifyOnAssignment" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "notifyOnNewTicket" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "notifyOnSlaWarning" BOOLEAN NOT NULL DEFAULT true;

-- Anti-rejeu de l'alerte « échéance imminente » : le balayage tourne toutes les
-- quelques minutes et retrouverait sinon le même ticket à chaque passage. Un
-- horodatage par horloge, sans quoi un ticket alerté sur sa première réponse ne
-- le serait jamais sur sa résolution.
ALTER TABLE "tickets"
    ADD COLUMN "firstResponseWarnedAt" TIMESTAMP(3),
    ADD COLUMN "resolutionWarnedAt" TIMESTAMP(3);

-- Combien de temps avant l'échéance l'alerte part. Réglable depuis
-- Paramètres > SLA, comme le reste du calendrier de décompte.
--
-- 30 minutes par défaut : assez tôt pour qu'un agent puisse encore écrire au
-- client, assez tard pour que l'alerte ne soit pas oubliée avant l'échéance.
INSERT INTO "global_settings" ("key", "value", "label", "description", "multiline", "updatedAt")
VALUES
    ('sla_warning_minutes', '30', 'Alerte avant échéance SLA',
     'Nombre de minutes avant l''échéance auquel l''email d''alerte est envoyé. 0 désactive l''alerte.',
     false, NOW())
ON CONFLICT ("key") DO NOTHING;
