-- Gestes de réponse aux droits d'une personne concernée : remise de son dossier,
-- effacement de son identité, suppression de sa fiche. Ce sont précisément les
-- gestes qu'un contrôle demande de prouver, ils entrent donc au journal comme
-- les autres.
--
-- Ajout d'enum isolé dans sa propre migration : PostgreSQL interdit d'UTILISER
-- une valeur ajoutée par `ALTER TYPE` dans la transaction qui l'ajoute. Les
-- séparer garantit que la migration suivante, et toute écriture applicative,
-- travaillent sur un type déjà complet.

ALTER TYPE "AuditAction" ADD VALUE 'SUBJECT_DATA_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBJECT_ANONYMIZED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBJECT_DELETED';
