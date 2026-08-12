-- Fusion réversible de fiches contacts en doublon.
--
-- Même modèle que la fusion de tickets (migration `20260804120000_ticket_merge`) :
-- la fiche absorbée n'est ni vidée ni supprimée, elle est rattachée à celle qui
-- devient le contact actif. C'est ce qui rend la fusion défaisable.
--
-- Et ce n'est pas qu'une précaution. La personne continue d'écrire depuis
-- l'adresse absorbée : c'est cette fiche-là que la résolution d'un email entrant
-- retrouve par son `email` (toujours unique), avant de suivre le lien jusqu'au
-- contact actif. Une fusion qui aurait supprimé la fiche verrait le prochain
-- message recréer le doublon qu'on venait d'effacer.
--
-- ON DELETE SET NULL et non CASCADE : supprimer le contact actif — un droit à
-- l'effacement, par exemple — ne doit pas emporter les fiches qu'il avait
-- absorbées. Elles redeviennent des contacts autonomes.

ALTER TABLE "clients" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "clients" ADD COLUMN "mergedAt" TIMESTAMP(3);

-- Lecture : « quelles fiches ce contact a-t-il absorbées ? », posée à chaque
-- affichage du répertoire.
CREATE INDEX "clients_mergedIntoId_idx" ON "clients"("mergedIntoId");

ALTER TABLE "clients" ADD CONSTRAINT "clients_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
