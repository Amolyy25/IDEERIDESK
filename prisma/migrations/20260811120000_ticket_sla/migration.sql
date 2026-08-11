-- Engagements de délai (SLA) sur les tickets.
--
-- Ce que ça installe : une horloge PAR TICKET, visible en temps réel dans la
-- file, et non un indicateur calculé en fin de mois. Deux délais distincts,
-- portés par la priorité — le temps qu'on se donne pour adresser un premier mot
-- au client, et celui qu'on se donne pour clore son dossier.
--
-- RIEN N'EST APPLIQUÉ RÉTROACTIVEMENT, et c'est délibéré :
--   — les délais des priorités existantes restent NULL, donc sans engagement,
--     tant qu'un administrateur n'a pas saisi les siens dans Paramètres > SLA.
--     Inventer « 2 h » à la place de l'équipe ferait apparaître dès le premier
--     jour une file de tickets « en retard » sur un engagement que personne n'a
--     jamais pris ;
--   — les tickets déjà en base gardent des échéances NULL et ne seront donc
--     jamais signalés en retard. Leur en calculer une depuis leur date de
--     création daterait le retard d'avant la décision.
-- La vue « SLA en retard » se remplit donc à partir des tickets créés après la
-- configuration des délais.

-- Les deux engagements, en minutes. Sur la priorité : « urgent en 2 h, faible
-- en 2 jours » est la formulation même de la règle.
ALTER TABLE "ticket_priorities"
    ADD COLUMN "firstResponseMinutes" INTEGER,
    ADD COLUMN "resolutionMinutes" INTEGER;

-- Statuts qui suspendent l'horloge (typiquement « En attente du client »).
-- Faux partout au départ : par défaut l'horloge ne s'arrête jamais, et
-- l'échéance affichée est la vraie échéance.
ALTER TABLE "ticket_statuses"
    ADD COLUMN "pausesSla" BOOLEAN NOT NULL DEFAULT false;

-- Échéances figées à la création du ticket, temps de première réponse, et
-- comptabilité des suspensions.
ALTER TABLE "tickets"
    ADD COLUMN "firstResponseDueAt" TIMESTAMP(3),
    ADD COLUMN "resolutionDueAt" TIMESTAMP(3),
    ADD COLUMN "firstRespondedAt" TIMESTAMP(3),
    ADD COLUMN "slaPausedAt" TIMESTAMP(3),
    ADD COLUMN "slaPausedMs" INTEGER NOT NULL DEFAULT 0;

-- Lecture de la vue « SLA en retard » et de son compteur, rejouée à chaque
-- affichage de la file.
CREATE INDEX "tickets_firstResponseDueAt_idx" ON "tickets"("firstResponseDueAt");
CREATE INDEX "tickets_resolutionDueAt_idx" ON "tickets"("resolutionDueAt");

-- Calendrier de décompte, réglable depuis Paramètres > SLA. Ces clés ne sont
-- pas éditables depuis la liste générique de /settings/general (voir
-- OWNED_BY_SECTION dans src/lib/actions/settings.ts) : « calendar » saisi à la
-- main dans un champ de texte libre n'a pas de sens pour un administrateur.
--
-- Le mode par défaut est le décompte calendaire : un ticket urgent (2 h) déposé
-- à 18 h est dû à 20 h. C'est le comportement le plus prévisible, et celui
-- qu'on peut vérifier sans connaître les horaires du support.
INSERT INTO "global_settings" ("key", "value", "label", "description", "multiline", "updatedAt")
VALUES
    ('sla_clock_mode', 'calendar', 'Mode de décompte du SLA',
     'calendar = 24 h/24, business = uniquement pendant les heures d''ouverture du support.',
     false, NOW()),
    ('sla_business_days', '1,2,3,4,5', 'Jours ouvrés du support',
     'Jours pris en compte en mode « heures d''ouverture », de 1 (lundi) à 7 (dimanche).',
     false, NOW()),
    ('sla_business_start', '09:00', 'Début des heures d''ouverture',
     'Heure à laquelle l''horloge SLA redémarre, dans le fuseau horaire de l''espace de travail.',
     false, NOW()),
    ('sla_business_end', '18:00', 'Fin des heures d''ouverture',
     'Heure à laquelle l''horloge SLA s''arrête jusqu''au prochain jour ouvré.',
     false, NOW())
ON CONFLICT ("key") DO NOTHING;
