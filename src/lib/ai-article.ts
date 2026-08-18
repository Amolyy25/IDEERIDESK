/**
 * Ce qu'on peut demander à l'IA d'écrire dans la base de connaissances.
 *
 * Le pendant de `ai-rewrite.ts`, à l'autre bout du geste : là-bas on REPREND un
 * texte déjà écrit, ici on part d'un sujet et de rien d'autre. Un article n'est
 * pourtant pas un texte libre — c'est une TRAME (procédure, incident, FAQ)
 * remplie avec un sujet, et c'est elle qui fait la différence entre un article
 * qu'on relit et un article qu'on réécrit entièrement.
 *
 * Trois réglages complètent la trame plutôt que d'être retapés en toutes lettres
 * à chaque fois — pour qui, quelle longueur, sur quel ton. La consigne libre
 * reste disponible par-dessus : aucune liste ne couvrira « insiste sur le fait
 * que la synchronisation peut prendre 24 h ».
 *
 * Module PUR, comme `ai-rewrite.ts` : importé par le formulaire d'article
 * (navigateur) comme par la route qui appelle le fournisseur (serveur). Aucun
 * accès à la base ici, et surtout — le navigateur n'envoie que des
 * identifiants, jamais le texte des consignes. Le serveur les retrouve ici.
 */

// ---------------------------------------------------------------------------
// Trames
// ---------------------------------------------------------------------------

export type ArticleFormatId = "procedure" | "incident" | "faq" | "concept" | "release" | "free";

export type ArticleFormat = {
  id: ArticleFormatId;
  label: string;
  /** Une ligne pour lever le doute entre deux trames voisines. */
  hint: string;
  /** La structure imposée, transmise telle quelle au fournisseur. */
  instruction: string;
};

/**
 * Les trames disent la STRUCTURE, jamais le fond : le fond vient du sujet écrit
 * par l'agent. Sans structure imposée, un modèle rend systématiquement le même
 * article en trois paragraphes tièdes, quel que soit le sujet — et c'est
 * précisément ce qu'un rédacteur doit ensuite tout reprendre.
 *
 * Les titres de section sont demandés en `<h2>` : le `<h1>` est le champ Titre
 * de l'article, il n'a pas à être répété dans le corps.
 */
export const ARTICLE_FORMATS: ArticleFormat[] = [
  {
    // En tête parce que c'est l'écrasante majorité d'une base de connaissances
    // de support : « comment fait-on pour… ».
    id: "procedure",
    label: "Procédure pas à pas",
    hint: "Comment faire quelque chose, dans l'ordre.",
    instruction: `Structure l'article en procédure :
- un paragraphe d'introduction qui dit à quoi sert cette procédure et dans quelle situation on l'utilise ;
- une section « Prérequis » en <h2>, uniquement s'il y en a réellement ;
- une section « Étapes » en <h2> contenant une liste numérotée <ol> : une seule action par étape, verbe d'action en tête, jamais deux manipulations dans le même point ;
- une section « Vérifier que tout fonctionne » en <h2>, deux ou trois lignes ;
- une section « Si ça ne fonctionne pas » en <h2> listant les deux ou trois blocages les plus probables et quoi faire.`,
  },
  {
    id: "incident",
    label: "Résolution d'incident",
    hint: "Un symptôme, sa cause, ce qu'on fait.",
    instruction: `Structure l'article en fiche d'incident, avec ces sections en <h2>, dans cet ordre :
- « Symptôme » : ce que la personne constate, décrit avec ses mots à elle ;
- « Cause » : ce qui produit ce symptôme ;
- « Solution » : les actions à mener, en liste numérotée <ol> ;
- « Contournement » : quoi faire en attendant, uniquement si la solution n'est pas immédiate ;
- « Quand escalader » : à quel moment le problème dépasse cette fiche.`,
  },
  {
    id: "faq",
    label: "Questions fréquentes",
    hint: "Cinq à huit questions, réponses courtes.",
    instruction: `Structure l'article en questions fréquentes :
- un paragraphe d'introduction d'une seule phrase ;
- puis cinq à huit questions, chacune en <h3> formulée telle qu'un utilisateur la poserait (pas un intitulé de rubrique), suivie d'une réponse de deux à quatre phrases ;
- classe les questions de la plus fréquente à la plus rare.`,
  },
  {
    id: "concept",
    label: "Explication fonctionnelle",
    hint: "À quoi ça sert, comment ça marche.",
    instruction: `Structure l'article en explication :
- un paragraphe d'introduction qui répond à « de quoi parle-t-on » en deux phrases ;
- une section « À quoi ça sert » en <h2> ;
- une section « Comment ça fonctionne » en <h2> ;
- une section « Cas d'usage » en <h2>, en liste ;
- une section « Limites à connaître » en <h2> : ce que la fonctionnalité ne fait pas. Ne l'invente pas — si le sujet fourni ne mentionne aucune limite, écris-y le marqueur à compléter.`,
  },
  {
    id: "release",
    label: "Note de version",
    hint: "Nouveautés, améliorations, corrections.",
    instruction: `Structure l'article en note de version, avec ces sections en <h2> — en n'écrivant que celles qui ont réellement du contenu :
- « Nouveautés », « Améliorations », « Corrections » ;
- dans chacune, une liste <ul> d'une ligne par changement, écrite du point de vue de ce que la personne peut faire de nouveau, pas du point de vue du code.`,
  },
  {
    // Le recours quand le sujet ne rentre dans aucune case : mieux vaut laisser
    // le modèle choisir sa structure que lui en imposer une qui ne colle pas.
    id: "free",
    label: "Structure libre",
    hint: "Le modèle choisit le plan le plus adapté.",
    instruction: `Choisis toi-même le plan le plus adapté au sujet. Découpe en sections avec des titres <h2> explicites, et privilégie les listes aux longs paragraphes.`,
  },
];

// ---------------------------------------------------------------------------
// Réglages : pour qui, quelle longueur, sur quel ton
// ---------------------------------------------------------------------------

export type ArticleOption<Id extends string> = {
  id: Id;
  label: string;
  hint: string;
  instruction: string;
};

export type ArticleAudienceId = "client" | "agent" | "internal";

/**
 * Le réglage qui change le plus le résultat. Le même sujet écrit pour un agent
 * immobilier et pour un intégrateur ne partage pas trois phrases.
 */
export const ARTICLE_AUDIENCES: ArticleOption<ArticleAudienceId>[] = [
  {
    id: "client",
    label: "Client final",
    hint: "Utilisateur en agence, pas informaticien.",
    instruction:
      "Le lecteur est un professionnel de l'immobilier qui utilise le logiciel, pas un informaticien. " +
      "Phrases courtes, une idée par phrase, aucun jargon technique. Les rares termes techniques " +
      "indispensables sont expliqués au moment où ils apparaissent.",
  },
  {
    id: "agent",
    label: "Agent support",
    hint: "Interne, connaît le produit.",
    instruction:
      "Le lecteur est un agent du support qui connaît déjà le produit. Va à l'essentiel, le vocabulaire " +
      "métier est acquis. Précise ce qu'il faut vérifier ou demander au client avant d'agir.",
  },
  {
    id: "internal",
    label: "Interne technique",
    hint: "Développeur, intégrateur.",
    instruction:
      "Le lecteur est technique. Nomme précisément les composants, paramètres et messages d'erreur. " +
      "Pas de reformulation pédagogique.",
  },
];

export type ArticleLengthId = "short" | "medium" | "long";

export const ARTICLE_LENGTHS: ArticleOption<ArticleLengthId>[] = [
  {
    id: "short",
    label: "Court",
    hint: "≈ 200 mots",
    instruction: "Vise environ 200 mots. Garde le strict nécessaire, supprime toute introduction longue.",
  },
  {
    id: "medium",
    label: "Standard",
    hint: "≈ 450 mots",
    instruction: "Vise environ 450 mots.",
  },
  {
    id: "long",
    label: "Détaillé",
    hint: "≈ 900 mots",
    instruction:
      "Vise environ 900 mots. Détaille chaque étape et explicite ce qui est habituellement sous-entendu, " +
      "sans pour autant ajouter d'information qui ne serait pas dans le sujet.",
  },
];

export type ArticleToneId = "neutral" | "guiding" | "warm";

export const ARTICLE_TONES: ArticleOption<ArticleToneId>[] = [
  {
    id: "neutral",
    label: "Neutre",
    hint: "Factuel, à l'infinitif.",
    instruction:
      "Registre neutre et factuel. Les actions sont à l'infinitif (« Cliquer sur… »), sans s'adresser au lecteur.",
  },
  {
    id: "guiding",
    label: "Guidant",
    hint: "S'adresse au lecteur, vouvoiement.",
    instruction:
      "Adresse-toi au lecteur au vouvoiement (« Cliquez sur… »). Reste professionnel, sans familiarité ni emoji.",
  },
  {
    id: "warm",
    label: "Chaleureux",
    hint: "Vouvoiement, rassure aux étapes délicates.",
    instruction:
      "Adresse-toi au lecteur au vouvoiement et reconnais la difficulté là où une étape est délicate ou " +
      "inhabituelle. Reste professionnel : pas de familiarité, pas d'emoji, pas de superlatif.",
  },
];

// ---------------------------------------------------------------------------
// Valeurs par défaut, bornes et accès
// ---------------------------------------------------------------------------

export const DEFAULT_ARTICLE_FORMAT: ArticleFormatId = "procedure";
export const DEFAULT_ARTICLE_AUDIENCE: ArticleAudienceId = "client";
export const DEFAULT_ARTICLE_LENGTH: ArticleLengthId = "medium";
export const DEFAULT_ARTICLE_TONE: ArticleToneId = "guiding";

/**
 * Le sujet est large à dessein : l'usage réel n'est pas « tape une phrase »,
 * c'est « colle tes notes ». Un agent qui vient de résoudre un problème a trois
 * lignes de brouillon et deux messages copiés, et c'est la meilleure matière
 * première possible pour un article.
 */
export const MAX_ARTICLE_SUBJECT_CHARS = 4000;

/** Même borne que la consigne libre de réécriture, pour la même raison. */
export const MAX_ARTICLE_INSTRUCTION_CHARS = 400;

export const ARTICLE_FORMAT_IDS = ARTICLE_FORMATS.map((f) => f.id) as [
  ArticleFormatId,
  ...ArticleFormatId[],
];
export const ARTICLE_AUDIENCE_IDS = ARTICLE_AUDIENCES.map((a) => a.id) as [
  ArticleAudienceId,
  ...ArticleAudienceId[],
];
export const ARTICLE_LENGTH_IDS = ARTICLE_LENGTHS.map((l) => l.id) as [
  ArticleLengthId,
  ...ArticleLengthId[],
];
export const ARTICLE_TONE_IDS = ARTICLE_TONES.map((t) => t.id) as [
  ArticleToneId,
  ...ArticleToneId[],
];

/**
 * Les listes couvrent tout leur type : le repli n'existe que pour un
 * identifiant arrivé d'ailleurs que des sélecteurs.
 */
function pick<Id extends string, T extends { id: Id }>(list: T[], id: Id): T {
  return list.find((item) => item.id === id) ?? list[0];
}

export function findArticleFormat(id: ArticleFormatId) {
  return pick(ARTICLE_FORMATS, id);
}

export function findArticleAudience(id: ArticleAudienceId) {
  return pick(ARTICLE_AUDIENCES, id);
}

export function findArticleLength(id: ArticleLengthId) {
  return pick(ARTICLE_LENGTHS, id);
}

export function findArticleTone(id: ArticleToneId) {
  return pick(ARTICLE_TONES, id);
}

/**
 * Le marqueur que le modèle doit poser à la place d'une information qu'il n'a
 * pas. C'est LE réglage qui rend une génération relisable : sans lui, un
 * chemin de menu ou un délai plausible mais faux se glisse dans l'article, et
 * personne ne le voit à la relecture parce qu'il est bien écrit. Avec lui, les
 * trous sont visibles à l'œil nu dans l'éditeur.
 */
export const ARTICLE_TODO_MARKER = "[à compléter :";
