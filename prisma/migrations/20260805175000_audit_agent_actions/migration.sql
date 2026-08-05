-- Gestes portant sur les comptes de l'équipe, jusqu'ici tracés nulle part alors
-- que ce sont les plus sensibles de l'application : ils décident de qui peut
-- voir et faire quoi.
--
-- Ajout d'enum isolé dans sa propre migration : PostgreSQL interdit d'UTILISER
-- une valeur ajoutée par `ALTER TYPE` dans la transaction qui l'ajoute. Les
-- séparer garantit que la migration suivante, et toute écriture applicative,
-- travaillent sur un type déjà complet.

ALTER TYPE "AuditAction" ADD VALUE 'AGENT_ACCESS_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_ACCESS_DENIED';
ALTER TYPE "AuditAction" ADD VALUE 'AGENT_PERMISSIONS_UPDATED';
