-- Permissions fines par agent : les trois booléens `canRespond`, `canApprove`
-- et le rôle ne suffisaient plus. Voir le registre src/lib/permissions.ts, qui
-- est le seul endroit décrivant ce que chaque clé autorise.

-- --------------------------------------------------------------------------
-- 1. La colonne
-- --------------------------------------------------------------------------

ALTER TABLE "agents" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- --------------------------------------------------------------------------
-- 2. Report des droits existants
-- --------------------------------------------------------------------------
--
-- Chaque agent retrouve exactement ce qu'il pouvait faire hier, à une exception
-- délibérée : le groupe « settings.* » n'est accordé à personne.
--
-- `canRespond` ouvrait à la fois « répondre à un client » ET la reconfiguration
-- de l'espace de travail (statuts, priorités, produits, champs personnalisés,
-- réponses prédéfinies) — un agent capable de répondre à un ticket pouvait
-- supprimer un statut utilisé par toute l'équipe. C'est précisément le défaut
-- que ce découpage corrige : les administrateurs gardent ces réglages par leur
-- rôle, un agent qui doit y toucher se les voit accorder explicitement depuis
-- la page Équipe.
--
-- Les administrateurs ne reçoivent rien : le rôle vaut déjà toutes les
-- permissions (voir `effectivePermissions`).

UPDATE "agents"
SET "permissions" =
  -- Ce dont disposait tout compte approuvé, quel que soit son niveau.
  ARRAY['tickets.view', 'clients.view', 'team.view', 'kb.view']
  -- Ce que `canRespond` ouvrait, hors configuration.
  || CASE
       WHEN "canRespond"
       THEN ARRAY['tickets.respond', 'tickets.merge', 'clients.manage', 'kb.manage']
       ELSE ARRAY[]::TEXT[]
     END
  -- La file de validation.
  || CASE WHEN "canApprove" THEN ARRAY['approvals.handle'] ELSE ARRAY[]::TEXT[] END
WHERE "role" <> 'ADMIN';

-- --------------------------------------------------------------------------
-- 3. Les anciens booléens
-- --------------------------------------------------------------------------
--
-- `requiresApproval` reste : ce n'est pas un droit accordé mais une retenue
-- imposée, elle n'a pas sa place dans le registre.

ALTER TABLE "agents" DROP COLUMN "canRespond";
ALTER TABLE "agents" DROP COLUMN "canApprove";
