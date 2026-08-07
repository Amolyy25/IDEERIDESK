-- Présence sur une fiche ticket : détection de collision entre deux agents qui
-- rédigent une réponse au même client en même temps.
--
-- Les deux clés étrangères sont en ON DELETE CASCADE, contrairement à celles du
-- journal d'audit qui se dénouent : une présence n'a aucune valeur de preuve, elle
-- ne dit que « en ce moment ». Elle n'a donc rien à survivre — ni au ticket, ni au
-- compte de l'agent. C'est aussi ce qui garantit qu'un compte effacé ne laisse pas
-- derrière lui la trace des dossiers qu'il consultait.

CREATE TABLE "ticket_presences" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "composingAt" TIMESTAMP(3),

    CONSTRAINT "ticket_presences_pkey" PRIMARY KEY ("id")
);

-- Un état courant par agent et par ticket, et non un historique : c'est ce qui
-- rend le battement idempotent (un `upsert` sur ce couple).
CREATE UNIQUE INDEX "ticket_presences_ticketId_agentId_key" ON "ticket_presences"("ticketId", "agentId");

-- Lecture : « qui d'autre est sur CETTE fiche, et récemment ? »
CREATE INDEX "ticket_presences_ticketId_seenAt_idx" ON "ticket_presences"("ticketId", "seenAt");

-- Ménage : « quelles lignes sont périmées, toutes fiches confondues ? » — sans cet
-- index, chaque battement balaierait la table entière.
CREATE INDEX "ticket_presences_seenAt_idx" ON "ticket_presences"("seenAt");

ALTER TABLE "ticket_presences" ADD CONSTRAINT "ticket_presences_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_presences" ADD CONSTRAINT "ticket_presences_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
