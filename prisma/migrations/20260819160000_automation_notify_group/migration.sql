-- Prévenir un groupe quand une règle agit sur un ticket.
--
-- Un ticket n'a qu'un assigné : confier une escalade à une équipe n'était donc
-- pas exprimable. La règle peut désormais prévenir tous les membres d'un groupe
-- (cloche + email) en laissant le ticket non assigné.
--
-- Additif, valeurs neutres : aucune règle existante ne change de comportement.

-- Ajout de valeur d'enum hors de toute utilisation dans la même transaction :
-- même forme que les deux ajouts précédents à ce type.
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION';

ALTER TABLE "automation_rules" ADD COLUMN "actionNotifyGroupId" TEXT;

ALTER TABLE "automation_rules"
    ADD CONSTRAINT "automation_rules_actionNotifyGroupId_fkey"
    FOREIGN KEY ("actionNotifyGroupId") REFERENCES "groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "automation_rules_actionNotifyGroupId_idx"
    ON "automation_rules"("actionNotifyGroupId");

-- Comme les trois autres emails d'équipe : reçu par défaut, coupé depuis la
-- fiche de l'agent. La ligne de cloche, elle, n'est jamais débrayable.
ALTER TABLE "agents"
    ADD COLUMN "notifyOnAutomation" BOOLEAN NOT NULL DEFAULT true;
