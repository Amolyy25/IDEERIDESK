/**
 * Mise en forme des chiffres des statistiques.
 *
 * Module à part, sans `"use server"` : les mêmes formats servent au rendu serveur
 * de la page et au panneau d'analyse, qui est un composant client. Les durées,
 * elles, ne sont PAS reformatées ici — `formatSlaDuration` (src/lib/sla.ts) le
 * fait déjà, et un délai de première réponse doit s'écrire exactement comme
 * l'échéance affichée sur la fiche du ticket (« 3 h 20 », « 2 j 4 h »).
 */

const countFormatter = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/**
 * Part en pourcentage, sans décimale au-delà de 10 % et avec une en dessous :
 * « 4 % » perd la différence entre 3,6 % et 4,4 % là où elle compte encore, et
 * « 62,4 % » donne une fausse impression de précision sur un volume de trente
 * tickets.
 */
export function formatShare(share: number | null): string {
  if (share === null || !Number.isFinite(share)) return "—";
  const percent = share * 100;
  if (percent > 0 && percent < 10) return `${percent.toFixed(1).replace(".", ",")} %`;
  return `${Math.round(percent)} %`;
}

/** Écart signé d'une tuile : « +12 % », « −8 % », ou `null` quand il n'a pas de sens. */
export function formatChange(changePercent: number | null): string | null {
  if (changePercent === null || !Number.isFinite(changePercent)) return null;

  const rounded = Math.round(changePercent);
  if (rounded === 0) return "stable";
  // Le signe moins typographique (U+2212) et non le trait d'union : sur un
  // chiffre, le second se lit comme une césure.
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded)} %`;
}

/** Écart en valeur absolue, quand le relatif n'est pas calculable (période vide). */
export function formatChangeCount(current: number, previous: number): string | null {
  const difference = current - previous;
  if (difference === 0) return "stable";
  const sign = difference > 0 ? "+" : "−";
  return `${sign}${formatCount(Math.abs(difference))}`;
}

const weekdayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const weekdayShortLabels = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

export function weekdayLabel(index: number): string {
  return weekdayLabels[index] ?? "";
}

export function weekdayShortLabel(index: number): string {
  return weekdayShortLabels[index] ?? "";
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")} h`;
}
