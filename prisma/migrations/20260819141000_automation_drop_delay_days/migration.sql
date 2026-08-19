-- Fin de la conversion du délai en minutes. Séparée de la migration qui pose
-- `delayMinutes` : `delayDays` devait survivre au temps où l'ancienne version du
-- code tournait encore sur cette base.
ALTER TABLE "automation_rules"
    DROP COLUMN "delayDays";
