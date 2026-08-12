-- Fusion de fiches contacts en doublon, et son annulation.
--
-- Tracées parce qu'elles déplacent des tickets d'un contact à l'autre et
-- changent l'adresse à laquelle partent les réponses : deux effets qu'aucun écran
-- ne raconte après coup. La fusion, elle, est réversible (voir la migration
-- `20260812130000_client_merge`), mais réversible n'est pas invisible.
--
-- Ajout d'enum isolé dans sa propre migration : PostgreSQL interdit d'UTILISER
-- une valeur ajoutée par `ALTER TYPE` dans la transaction qui l'ajoute. La
-- séparer garantit que toute écriture applicative travaille sur un type déjà
-- complet.

ALTER TYPE "AuditAction" ADD VALUE 'CLIENTS_MERGED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENTS_UNMERGED';
