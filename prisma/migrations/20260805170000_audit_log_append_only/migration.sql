-- Journal d'audit en AJOUT SEUL, garanti par la base et non par la seule
-- discipline du code applicatif.
--
-- Pourquoi ici et pas seulement dans l'application : « non modifiable par un
-- agent » est une propriété qui doit tenir même face à une Server Action ajoutée
-- par distraction, à un `prisma.auditLog.update` écrit dans un script de
-- maintenance, ou à une console SQL ouverte par curiosité. Une absence de code
-- n'est pas une garantie — elle ne survit pas au prochain commit.
--
-- Deux exceptions, toutes deux nécessaires :
--
--   1. Le DÉNOUAGE d'un lien. Supprimer un ticket ou un compte agent déclenche un
--      UPDATE sur ce journal (les clés étrangères sont en ON DELETE SET NULL, pour
--      que la trace survive à ce qu'elle raconte). Interdire tout UPDATE aurait
--      donc rendu la suppression d'un ticket impossible. Seul le passage à NULL
--      est toléré : détourner un lien vers un AUTRE ticket reste refusé.
--
--   2. La PURGE de conservation, réservée à un appelant qui la réclame
--      explicitement par `SET LOCAL "ideeri.audit_purge" = 'on'`. Un journal qui
--      grossit sans fin est lui-même un risque RGPD ; sans cette porte, une
--      politique de conservation aurait obligé à supprimer les déclencheurs, donc
--      à tout déverrouiller d'un coup. Aucun code applicatif ne pose ce drapeau.

-- Toute modification d'une trace est refusée, sauf le dénouage d'un lien.
CREATE OR REPLACE FUNCTION "audit_logs_reject_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
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

  RAISE EXCEPTION
    'Le journal d''audit est en ajout seul : modification refusée (entrée %).', OLD."id";
END;
$$;

CREATE TRIGGER "audit_logs_reject_update"
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_update"();

-- Toute suppression est refusée, sauf purge de conservation explicite.
CREATE OR REPLACE FUNCTION "audit_logs_reject_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- `true` en second argument : renvoie NULL au lieu d'échouer quand le
  -- paramètre n'a jamais été posé, ce qui est le cas normal.
  IF current_setting('ideeri.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Le journal d''audit est en ajout seul : suppression refusée (entrée %). Une purge de conservation doit poser SET LOCAL "ideeri.audit_purge" = ''on''.',
    OLD."id";
END;
$$;

CREATE TRIGGER "audit_logs_reject_delete"
BEFORE DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_delete"();
