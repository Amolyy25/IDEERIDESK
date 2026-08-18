-- Réponse à une note interne : le message cité, quand la note en cite un.
--
-- ON DELETE SET NULL et non CASCADE : supprimer une note ne doit pas emporter
-- les réponses qu'elle a suscitées — elles portent le travail fait ensuite. Le
-- fil retombe alors sur l'affichage d'une note ordinaire, sans citation.
--
-- Pas d'index sur la colonne : la fiche ticket charge déjà tous ses messages et
-- résout les citations en mémoire, aucune lecture ne filtre là-dessus.
ALTER TABLE "messages"
    ADD COLUMN "replyToId" TEXT;

ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
