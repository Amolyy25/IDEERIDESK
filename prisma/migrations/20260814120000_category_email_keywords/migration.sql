-- Mots-clés de rattachement d'un email entrant à un produit concerné.
--
-- La reconnaissance existait déjà, mais sa table de correspondance était écrite
-- dans le code et rattachait par *nom* de produit. Elle tombait donc en silence
-- au premier renommage fait depuis /settings/categories : la règle « papiris »
-- pointait vers un produit nommé « Papairis » qui n'existait plus sous ce nom,
-- et le ticket arrivait sans produit sans que rien ne le signale. Les mots-clés
-- vivent désormais sur la ligne du produit : renommer le produit ne peut plus
-- casser son rattachement, et l'équipe ajoute ses propres mots sans passer par
-- un déploiement.
--
-- Liste vide par défaut : un produit sans mot-clé n'est jamais posé
-- automatiquement, ce qui laisse les nouveaux produits hors du tri tant que
-- personne n'a décidé à quels mots ils répondent.
ALTER TABLE "ticket_categories"
    ADD COLUMN "emailKeywords" TEXT[] NOT NULL DEFAULT '{}';

-- Reprise des règles qui étaient dans le code, pour que le tri à l'arrivée ne
-- s'arrête pas le temps que quelqu'un ressaisisse tout à la main. Rattachées au
-- nom hors casse, et seulement si le produit n'a pas déjà ses propres mots :
-- rejouer cette migration ne peut pas écraser un paramétrage.
--
-- « Papiris » porte aussi l'orthographe « Papairis » : les deux circulent dans
-- les emails des clients, et c'est précisément ce genre de variante que la
-- liste en dur ne savait pas suivre.
UPDATE "ticket_categories"
SET "emailKeywords" = ARRAY['papiris', 'papairis']
WHERE lower("name") IN ('papiris', 'papairis')
  AND cardinality("emailKeywords") = 0;

UPDATE "ticket_categories"
SET "emailKeywords" = ARRAY['compagnon', 'app compagnon']
WHERE lower("name") = 'app compagnon'
  AND cardinality("emailKeywords") = 0;

-- « ideeri » seul n'est volontairement pas repris : c'est le nom de la maison,
-- il figure dans la signature de n'importe quel email et rattachait à « App
-- Ideeri » des demandes qui parlaient d'autre chose. Les formes qui désignent
-- réellement le produit sont conservées.
UPDATE "ticket_categories"
SET "emailKeywords" = ARRAY['app ideeri', 'ideeri desk', 'ideeridesk']
WHERE lower("name") = 'app ideeri'
  AND cardinality("emailKeywords") = 0;
