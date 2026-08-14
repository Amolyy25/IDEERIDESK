/**
 * Les intentions de réécriture : ce qu'on peut demander à l'IA de faire d'un
 * message déjà écrit.
 *
 * La différence avec la suggestion (`/api/ai/suggest`) tient en une phrase :
 * celle-ci ÉCRIT à la place de l'agent à partir du ticket, celle-là REPREND ce
 * que l'agent vient d'écrire. C'est le second usage qui sert le plus souvent —
 * la réponse est trouvée, c'est la formulation qui coince : une faute, un ton
 * trop sec, trois lignes de trop.
 *
 * Chaque intention est une consigne écrite d'avance, jamais transmise par le
 * navigateur : le client n'envoie que l'identifiant, le serveur retrouve le
 * texte ici. La consigne libre est la seule exception, et c'est sa raison
 * d'être — aucune liste ne couvrira « reformule ça comme pour un notaire ».
 *
 * Module PUR : importé par la fenêtre de rédaction (navigateur) comme par la
 * route qui appelle le fournisseur (serveur). Aucun accès à la base ici.
 */

export type RewriteIntentId =
  | "improve"
  | "correct"
  | "professional"
  | "clearer"
  | "shorter"
  | "longer"
  | "warmer"
  | "custom";

export type RewriteIntent = {
  id: RewriteIntentId;
  /** Ce que l'agent lit dans le menu. */
  label: string;
  /**
   * Le même, en un mot, pour le bouton : c'est lui qui annonce ce que fera la
   * touche Tab, et il ne peut pas s'élargir à chaque intention plus longue que
   * la précédente — les boutons voisins glisseraient avec lui.
   */
  short: string;
  /** Une ligne de plus, pour lever le doute entre deux intentions voisines. */
  hint: string;
  /**
   * Ce qui part réellement au fournisseur. Vide pour `custom` : la consigne est
   * alors celle que l'agent a tapée.
   */
  instruction: string;
};

/**
 * Les consignes sont écrites à l'impératif et disent AUSSI ce qu'il ne faut pas
 * toucher. Sans cette seconde moitié, « rends ce message plus professionnel »
 * revient avec des informations qui n'y étaient pas — un délai inventé, un prix
 * arrondi — que l'agent relit sans les voir, parce qu'elles sont bien écrites.
 */
export const REWRITE_INTENTS: RewriteIntent[] = [
  {
    // En tête de liste parce que c'est celle de la touche Tab : la demande la
    // plus fréquente n'est pas « corrige mes fautes » mais « rends ça
    // présentable » — les fautes en font partie, les tournures bancales aussi.
    id: "improve",
    label: "Améliorer le message",
    short: "Améliorer",
    hint: "Fautes, tournures et répétitions. Le fond ne bouge pas.",
    instruction:
      "Améliore ce message : corrige l'orthographe, la grammaire et la ponctuation, redresse les " +
      "tournures maladroites, supprime les répétitions et les mots inutiles. Garde le ton, le sens, " +
      "la structure et toutes les informations ; ne rallonge pas le message.",
  },
  {
    id: "correct",
    label: "Corriger l'orthographe",
    short: "Corriger",
    hint: "Fautes et accords seulement. Pas un mot ne change.",
    instruction:
      "Corrige uniquement l'orthographe, la grammaire, les accords, la conjugaison et la ponctuation. " +
      "Ne change ni le ton, ni le vocabulaire, ni l'ordre des phrases, ni la longueur du message.",
  },
  {
    id: "professional",
    label: "Rendre plus professionnel",
    short: "Plus pro",
    hint: "Registre soigné, vouvoiement, formulations posées.",
    instruction:
      "Réécris ce message dans un registre professionnel soigné : vouvoiement, formulations posées, " +
      "phrases complètes, aucune familiarité ni abréviation. Garde exactement les mêmes informations.",
  },
  {
    id: "clearer",
    label: "Simplifier",
    short: "Simplifier",
    hint: "Pour un client qui n'est pas informaticien.",
    instruction:
      "Réécris ce message pour qu'il soit compris sans effort par une personne non technique : " +
      "phrases courtes, une idée par phrase, pas de jargon. Explique les termes techniques indispensables.",
  },
  {
    id: "shorter",
    label: "Raccourcir",
    short: "Raccourcir",
    hint: "Mêmes informations, moitié moins de lignes.",
    instruction:
      "Raccourcis ce message : supprime les répétitions, les formules de politesse superflues et les " +
      "précisions qui n'apportent rien. Conserve toutes les informations utiles au client.",
  },
  {
    id: "longer",
    label: "Développer",
    short: "Développer",
    hint: "Étapes détaillées, contexte explicité.",
    instruction:
      "Développe ce message : détaille les étapes, explicite ce qui est sous-entendu et annonce ce qui " +
      "va se passer ensuite. N'ajoute aucune information qui ne figure pas déjà dans le message.",
  },
  {
    id: "warmer",
    label: "Adoucir le ton",
    short: "Adoucir",
    hint: "Plus chaleureux, sans familiarité.",
    instruction:
      "Rends ce message plus chaleureux et plus empathique, en reconnaissant la gêne occasionnée s'il y a " +
      "lieu. Reste professionnel : pas de familiarité, pas d'emoji, pas de superlatifs.",
  },
  {
    id: "custom",
    label: "Autre consigne…",
    short: "Consigne",
    hint: "Dites-lui quoi faire, en toutes lettres.",
    instruction: "",
  },
];

/** Ce que fait la touche Tab tant que l'agent n'a rien choisi d'autre. */
export const DEFAULT_REWRITE_INTENT: RewriteIntentId = "improve";

export const REWRITE_INTENT_IDS = REWRITE_INTENTS.map((intent) => intent.id) as [
  RewriteIntentId,
  ...RewriteIntentId[],
];

/**
 * Bornes de ce qui part au fournisseur. La consigne libre est courte par nature
 * (« en mode ultra pro ») ; au-delà de quelques lignes, ce n'est plus une
 * consigne mais un message à part entière, qui a sa place dans le champ.
 */
export const MAX_REWRITE_INSTRUCTION_CHARS = 400;

/**
 * Un message de support qui dépasse cette taille n'existe pas — c'est un
 * copier-coller de journal d'erreurs, et le faire réécrire coûterait cher pour
 * un résultat qui ne servirait à personne.
 */
export const MAX_REWRITE_INPUT_CHARS = 8000;

export function findRewriteIntent(id: RewriteIntentId): RewriteIntent {
  // La liste couvre tout le type : le repli n'est là que pour un identifiant
  // arrivé d'ailleurs que du menu.
  return REWRITE_INTENTS.find((intent) => intent.id === id) ?? REWRITE_INTENTS[0];
}
