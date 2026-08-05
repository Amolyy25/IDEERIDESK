/**
 * Variables des réponses prédéfinies : `{{client}}`, `{{agent}}`… remplacées par
 * le contexte du ticket au moment où l'agent insère la réponse dans son champ.
 *
 * Module volontairement séparé du registre de filtrage
 * (`src/lib/canned-responses.ts`, qui interroge la base) : le formulaire de
 * réglages liste ces variables dans le navigateur, il ne doit pas embarquer le
 * client de base de données pour autant.
 */

/**
 * Contexte de remplissage. Chaque valeur peut manquer : un ticket arrivé sans
 * client rattaché n'a pas de nom à insérer.
 */
export type CannedVariables = {
  /** Nom du client rattaché au ticket. */
  client: string | null;
  /** Nom de l'agent qui s'apprête à répondre. */
  agent: string | null;
  /** Numéro du ticket, préfixé du dièse (« #128 »). */
  ticket: string | null;
  /** Produit concerné par le ticket. */
  produit: string | null;
};

/** Documentation affichée sous l'éditeur, tirée de la même source que le remplissage. */
export const CANNED_RESPONSE_VARIABLES: {
  name: keyof CannedVariables;
  description: string;
}[] = [
  { name: "client", description: "Nom du client qui a ouvert le ticket." },
  { name: "agent", description: "Votre nom, celui de l'agent qui insère la réponse." },
  { name: "ticket", description: "Numéro du ticket, ex. « #128 »." },
  { name: "produit", description: "Produit concerné par le ticket." },
];

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Remplace les `{{variable}}` du corps par le contexte du ticket ouvert.
 *
 * Une variable inconnue ou sans valeur est laissée telle quelle, bien visible :
 * le texte arrive dans le champ de rédaction, pas dans un email déjà parti.
 * L'agent voit `{{client}}` et complète — là où un remplacement par du vide
 * aurait produit « Bonjour , » et serait passé inaperçu.
 *
 * Pas d'échappement, contrairement aux signatures : le corps d'un message est du
 * texte brut (`Message.content`), il n'y a pas de HTML à protéger.
 */
export function fillCannedVariables(body: string, variables: CannedVariables): string {
  return body.replace(PLACEHOLDER, (match, name: string) => {
    if (!Object.hasOwn(variables, name)) {
      return match;
    }

    const value = variables[name as keyof CannedVariables];
    if (!value) {
      return match;
    }
    return value;
  });
}
