-- Droits d'une personne concernée : anonymisation d'un contact ou d'un compte,
-- le journal d'audit étant conservé.
--
-- Deux choses ici : la date d'anonymisation sur les deux tables qui portent une
-- identité, et l'ouverture d'un canal étroit de pseudonymisation dans le
-- déclencheur qui tient le journal en ajout seul.

ALTER TABLE "clients" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "agents"  ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Troisième (et dernière) exception au journal en ajout seul
-- ---------------------------------------------------------------------------
--
-- Le problème, tel qu'il se pose : le journal fige `actorName` et `actorEmail`
-- pour qu'une trace ne perde jamais son auteur, et recopie l'identité d'un
-- compte dans `summary` (« Compte X (x@…) ») comme dans `changes`
-- (« Assigné à : X → … »). Une personne qui demande l'effacement de ses données
-- resterait donc nommée en clair dans un journal qu'on ne peut pas modifier :
-- l'anonymisation serait purement cosmétique.
--
-- Supprimer ses entrées n'est pas la réponse — le journal doit être CONSERVÉ,
-- c'est ce qui permet de dire des années plus tard qui a ouvert quel dossier.
-- La réponse est de séparer les deux choses que porte une ligne : le FAIT (quelle
-- action, quand, sur quel ticket) et l'IDENTITÉ de la personne. Le fait reste
-- immuable, y compris sous ce drapeau ; l'identité, elle, peut être remplacée par
-- une forme pseudonyme.
--
-- Ce qui reste refusé même le drapeau posé, et c'est l'essentiel :
--   — `id`, `action`, `createdAt` : on ne réécrit pas l'histoire ;
--   — `ticketNumber`, `ticketSubject` : le dossier visé ne change pas ;
--   — `actorId`, `ticketId` : les liens ne peuvent toujours que se dénouer, donc
--     les traces d'une même personne restent regroupées après pseudonymisation ;
--   — une valeur d'identité quelconque : `actorName` et `actorEmail` ne peuvent
--     être remplacés que par la forme pseudonyme, jamais par le nom de
--     quelqu'un d'autre.
--
-- Ce qui devient possible : réécrire `summary` et `changes`, seuls endroits où
-- une identité apparaît en texte libre. Le contrôle de forme n'y est pas
-- possible (ce sont des phrases et du JSON), la garantie repose donc là sur le
-- drapeau explicite et sur l'unique appelant applicatif
-- (`src/lib/privacy-journal.ts`), qui ne remplace jamais autre chose que les
-- occurrences exactes du nom et de l'email de la personne visée.
--
-- Le drapeau se pose par `SET LOCAL "ideeri.audit_pseudonymize" = 'on'`, donc
-- dans une transaction et pour elle seule : aucun autre code ne peut en
-- bénéficier par inadvertance.

CREATE OR REPLACE FUNCTION "audit_logs_reject_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Dénouage d'un lien : la suppression d'un ticket ou d'un compte doit
  --    rester possible (clés étrangères en ON DELETE SET NULL).
  IF NEW."id"            IS NOT DISTINCT FROM OLD."id"
 AND NEW."action"        IS NOT DISTINCT FROM OLD."action"
 AND NEW."createdAt"     IS NOT DISTINCT FROM OLD."createdAt"
 AND NEW."actorName"     IS NOT DISTINCT FROM OLD."actorName"
 AND NEW."actorEmail"    IS NOT DISTINCT FROM OLD."actorEmail"
 AND NEW."ticketNumber"  IS NOT DISTINCT FROM OLD."ticketNumber"
 AND NEW."ticketSubject" IS NOT DISTINCT FROM OLD."ticketSubject"
 AND NEW."changes"       IS NOT DISTINCT FROM OLD."changes"
 AND NEW."summary"       IS NOT DISTINCT FROM OLD."summary"
 -- Les deux liens ne peuvent que se dénouer, jamais changer de cible.
 AND (NEW."actorId"  IS NOT DISTINCT FROM OLD."actorId"  OR NEW."actorId"  IS NULL)
 AND (NEW."ticketId" IS NOT DISTINCT FROM OLD."ticketId" OR NEW."ticketId" IS NULL)
  THEN
    RETURN NEW;
  END IF;

  -- 2. Pseudonymisation d'une personne concernée, explicitement réclamée.
  IF current_setting('ideeri.audit_pseudonymize', true) = 'on'
 AND NEW."id"            IS NOT DISTINCT FROM OLD."id"
 AND NEW."action"        IS NOT DISTINCT FROM OLD."action"
 AND NEW."createdAt"     IS NOT DISTINCT FROM OLD."createdAt"
 AND NEW."ticketNumber"  IS NOT DISTINCT FROM OLD."ticketNumber"
 AND NEW."ticketSubject" IS NOT DISTINCT FROM OLD."ticketSubject"
 AND NEW."actorId"       IS NOT DISTINCT FROM OLD."actorId"
 AND NEW."ticketId"      IS NOT DISTINCT FROM OLD."ticketId"
 -- Inchangés, ou remplacés par la forme pseudonyme — rien d'autre. Les motifs
 -- doivent rester alignés sur `src/lib/privacy-subject.ts`.
 AND (NEW."actorName"  IS NOT DISTINCT FROM OLD."actorName"
      OR NEW."actorName"  LIKE 'Personne anonymisée (%)')
 AND (NEW."actorEmail" IS NOT DISTINCT FROM OLD."actorEmail"
      OR NEW."actorEmail" LIKE 'anonyme-%@ideeri.invalid')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Le journal d''audit est en ajout seul : modification refusée (entrée %).', OLD."id";
END;
$$;
