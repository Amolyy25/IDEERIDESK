-- Un couple de tickets ne peut porter qu'UN rapprochement, quel que soit le sens
-- dans lequel la détection l'a rencontré.
--
-- Ce que `@@unique([ticketId, candidateId])` laissait passer : il ne voit que le
-- couple ORDONNÉ. Rien n'empêchait donc (A, B) et (B, A) de coexister — deux
-- lignes pour un seul et même rapprochement. Sur la fiche, l'agent voyait le
-- même ticket proposé deux fois, avec deux scores différents et deux sens de
-- fusion contradictoires ; et la seconde ligne avait coûté un appel au
-- fournisseur d'IA pour un verdict déjà rendu.
--
-- Pourquoi ici et pas seulement dans l'application : `scanTicketForDuplicates`
-- écarte désormais les candidats déjà jugés avant d'appeler le modèle, ce qui
-- traite le cas normal et l'essentiel du coût. Reste la course — deux agents
-- ouvrant les deux fiches du couple à la même seconde — qu'aucune vérification
-- lue-puis-écrite ne peut fermer côté application. L'index la ferme.
--
-- Prisma ne sait pas décrire un index sur expression dans un schéma : il
-- n'apparaît donc pas dans schema.prisma, d'où ce commentaire. Conséquence à
-- connaître avant d'écrire du code sur cette table : insérer le miroir d'un
-- rapprochement existant lève une erreur d'unicité (P2002). C'est voulu, et
-- `scanTicketForDuplicates` la traite comme un succès.

-- Dédoublonnage préalable, sans quoi l'index ne peut pas être créé. On garde la
-- ligne la plus ancienne de chaque couple : c'est celle qu'un agent a déjà pu
-- voir, et celle dont la décision (écarté, fusionné) porte l'antériorité.
DELETE FROM "ticket_duplicate_suggestions" AS a
USING "ticket_duplicate_suggestions" AS b
WHERE LEAST(a."ticketId", a."candidateId") = LEAST(b."ticketId", b."candidateId")
  AND GREATEST(a."ticketId", a."candidateId") = GREATEST(b."ticketId", b."candidateId")
  AND (a."createdAt", a."id") > (b."createdAt", b."id");

CREATE UNIQUE INDEX "ticket_duplicate_suggestions_pair_key"
  ON "ticket_duplicate_suggestions" (
    LEAST("ticketId", "candidateId"),
    GREATEST("ticketId", "candidateId")
  );
