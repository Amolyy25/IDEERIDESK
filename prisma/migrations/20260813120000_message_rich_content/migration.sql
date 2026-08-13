-- Mise en forme des réponses d'agent (éditeur riche dans la zone de réponse).
--
-- Colonne ajoutée à côté de `content` plutôt qu'à sa place : le texte brut est
-- lu par la recherche de la liste de tickets, l'export CSV, le dossier RGPD, le
-- contexte transmis à l'IA, l'historique repris en bas des emails et la partie
-- text/plain de chaque email sortant. Toutes ces lectures veulent du texte —
-- basculer `content` en HTML les aurait obligées à retirer les balises à chaque
-- appel, et aurait fait apparaître du balisage dans un export client.
--
-- Nullable, sans valeur par défaut : les messages déjà en base et les messages
-- entrants (un email reçu est réduit à son texte à la synchronisation) n'ont pas
-- de version mise en forme, et l'affichage retombe sur `content`. Aucune reprise
-- de données n'est donc nécessaire.
ALTER TABLE "messages"
    ADD COLUMN "contentHtml" TEXT;
