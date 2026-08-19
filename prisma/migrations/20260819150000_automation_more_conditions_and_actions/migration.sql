-- Conditions et actions supplémentaires sur les règles automatiques.
--
-- Purement additif, valeurs par défaut neutres : une règle déjà en base garde
-- exactement le comportement qu'elle avait.

-- Produits concernés, liste vide = tous.
ALTER TABLE "automation_rules"
    ADD COLUMN "triggerCategoryIds" TEXT[] NOT NULL DEFAULT '{}';

-- « Sans activité » comptait n'importe quel mouvement sur le ticket, note
-- interne comprise. `onlyUnanswered` permet enfin d'écrire la règle qu'on avait
-- vraiment en tête : personne n'a répondu au client.
ALTER TABLE "automation_rules"
    ADD COLUMN "onlyUnanswered" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "onlyUnassigned" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "onlyBreachedSla" BOOLEAN NOT NULL DEFAULT false;

-- Actions facultatives : NULL = ne pas y toucher. ON DELETE SET NULL et non
-- RESTRICT : supprimer une priorité ou un agent doit rester possible, la règle
-- perd alors ce volet plutôt que de bloquer la suppression.
ALTER TABLE "automation_rules"
    ADD COLUMN "actionPriorityId" TEXT,
    ADD COLUMN "actionAssigneeId" TEXT;

ALTER TABLE "automation_rules"
    ADD CONSTRAINT "automation_rules_actionPriorityId_fkey"
    FOREIGN KEY ("actionPriorityId") REFERENCES "ticket_priorities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automation_rules"
    ADD CONSTRAINT "automation_rules_actionAssigneeId_fkey"
    FOREIGN KEY ("actionAssigneeId") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "automation_rules_actionPriorityId_idx" ON "automation_rules"("actionPriorityId");
CREATE INDEX "automation_rules_actionAssigneeId_idx" ON "automation_rules"("actionAssigneeId");

-- Mise en forme du message client, saisie dans l'éditeur riche. `emailContent`
-- reste la partie text/plain de l'envoi.
ALTER TABLE "automation_rules"
    ADD COLUMN "emailHtml" TEXT;
