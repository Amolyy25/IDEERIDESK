/**
 * Valeurs réservées des filtres de la liste de tickets.
 *
 * Dans un module à part et non dans `@/lib/actions/tickets` : un fichier
 * `"use server"` ne peut exporter que des fonctions asynchrones, une constante
 * partagée avec la barre de filtres (composant client) y serait refusée.
 */

/** `assigneeId` demandant les tickets que personne n'a pris en charge. */
export const UNASSIGNED_FILTER = "none";
