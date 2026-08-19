/**
 * Le délai d'une règle automatique, stocké en minutes. Partagé entre le schéma
 * de validation (serveur) et le formulaire de réglages (client).
 */

export const DELAY_UNITS = [
  { value: "minutes", label: "minutes", minutes: 1 },
  { value: "hours", label: "heures", minutes: 60 },
  { value: "days", label: "jours", minutes: 1440 },
] as const;

export type DelayUnit = (typeof DELAY_UNITS)[number]["value"];

// Plancher aligné sur la cadence de l'ordonnanceur : sous 5 minutes, le délai
// annoncé serait plus court que l'intervalle entre deux passages du cron.
export const MIN_DELAY_MINUTES = 5;
export const MAX_DELAY_MINUTES = 365 * 1440;

export const DEFAULT_DELAY_MINUTES = 3 * 1440;

// Les délais qu'on pose réellement dans une règle. Proposés en un clic parce que
// « 4 h » saisi en deux contrôles (valeur + unité) est le geste le plus pénible
// du formulaire pour le cas le plus courant.
export const DELAY_PRESETS = [60, 240, 1440, 4320, 10080];

function unitConfig(unit: DelayUnit) {
  return DELAY_UNITS.find((candidate) => candidate.value === unit) ?? DELAY_UNITS[0];
}

export function delayToMinutes(value: number, unit: DelayUnit) {
  return value * unitConfig(unit).minutes;
}

// Plus grande unité qui divise le délai : 240 minutes se rouvrent sur « 4 heures »
export function splitDelay(minutes: number): { value: number; unit: DelayUnit } {
  for (const unit of [...DELAY_UNITS].reverse()) {
    if (minutes >= unit.minutes && minutes % unit.minutes === 0) {
      return { value: minutes / unit.minutes, unit: unit.value };
    }
  }
  return { value: minutes, unit: "minutes" };
}
