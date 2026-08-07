-- Analyse antivirus des fichiers téléversés.
--
-- Contexte : les pièces jointes arrivées par email sont analysées en amont par
-- Gmail, mais aucun des six points d'entrée de téléversement de l'application
-- (portail public, widget, images d'article, images de signature, logo/favicon
-- du portail, en-tête de source) ne passait le moindre contrôle de contenu. Le
-- fichier était écrit en base sur la seule foi du `Content-Type` annoncé par le
-- client.
--
-- Le statut par défaut est PENDING, y compris pour les lignes déjà en base :
-- c'est volontaire. Tout le stock existant n'a jamais été analysé, il doit donc
-- passer au rescan (/api/cron/antivirus) comme les nouveaux fichiers. Marquer
-- l'existant CLEAN reviendrait à déclarer sain ce qu'on n'a jamais regardé.

CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- Pièces jointes de tickets : le volume le plus exposé, alimenté par des tiers
-- non authentifiés (formulaire public, réponse par email).
ALTER TABLE "attachments"
    ADD COLUMN "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "scanSignature" TEXT,
    ADD COLUMN "scannedAt" TIMESTAMP(3);

-- Visuels publics : logo et favicon du portail, en-têtes de formulaires de
-- source, images de signature d'email. Servis sans authentification, donc à
-- traiter comme le reste même si le dépôt est réservé aux administrateurs.
ALTER TABLE "portal_assets"
    ADD COLUMN "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "scanSignature" TEXT,
    ADD COLUMN "scannedAt" TIMESTAMP(3);

ALTER TABLE "knowledge_article_images"
    ADD COLUMN "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "scanSignature" TEXT,
    ADD COLUMN "scannedAt" TIMESTAMP(3);

-- Lecture du cron de rescan : « que reste-t-il à analyser ? ». Sans ces index,
-- chaque passage balaierait des tables qui portent les octets des fichiers.
CREATE INDEX "attachments_scanStatus_idx" ON "attachments"("scanStatus");
CREATE INDEX "portal_assets_scanStatus_idx" ON "portal_assets"("scanStatus");
CREATE INDEX "knowledge_article_images_scanStatus_idx" ON "knowledge_article_images"("scanStatus");
