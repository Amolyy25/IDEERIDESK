/**
 * Listes blanches de l'assainissement HTML, isolées de leur mise en œuvre.
 *
 * Ce module ne dépend de rien : `sanitize-html.ts` les consomme côté serveur
 * (il tire DOMPurify et jsdom, qui n'ont rien à faire dans un bundle client) et
 * les formulaires d'édition s'en servent pour afficher à l'auteur ce qui sera
 * conservé. Une seule source de vérité : la politique annoncée dans l'interface
 * ne peut pas divorcer de celle réellement appliquée.
 */

/** Nœuds texte : DOMPurify les traite comme une balise, ils doivent être listés. */
export const TEXT_NODE = "#text";

// Aligné sur ce que l'éditeur Tiptap peut produire et sur ce que sait styler
// `ARTICLE_PROSE_CLASS` (src/lib/article-html.ts).
export const ARTICLE_TAGS = [
  TEXT_NODE,
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
  // Vidéo intégrée (extension VideoEmbed) : `div[data-video-embed] > iframe`.
  // La source est restreinte à YouTube et Vimeo par `sanitizeRichHtml`.
  "iframe",
  // CSS assumé : un article doit pouvoir embarquer sa propre mise en forme,
  // collée avec le HTML. Conséquence acceptée : ces règles ne sont pas
  // encapsulées, elles s'appliquent à toute la page qui affiche l'article.
  "style",
];

// `style` inclus : le CSS fait partie du contenu qu'un rédacteur peut coller.
// Ce qui reste exclu est ce qui EXÉCUTE du code, pas ce qui met en forme.
export const ARTICLE_ATTR = [
  "style",
  "class",
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "colspan",
  "rowspan",
  "data-video-embed",
  "allowfullscreen",
  "frameborder",
  "allow",
];

/** Hôtes autorisés comme source d'iframe dans un article. */
export const ALLOWED_IFRAME_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com"];

// Les attributs propres à l'iframe vidéo n'ont pas de sens en email, où l'iframe
// est de toute façon interdite (aucun client mail ne l'affiche).
const VIDEO_ONLY_ATTR = ["data-video-embed", "allowfullscreen", "allow", "frameborder"];

// Seule l'`iframe` reste propre aux articles : aucun client mail ne l'affiche.
// Le bloc `<style>`, lui, est accepté des deux côtés.
const ARTICLE_ONLY_TAGS = ["iframe"];

export const EMAIL_TAGS = [
  TEXT_NODE,
  ...ARTICLE_TAGS.filter((tag) => tag !== TEXT_NODE && !ARTICLE_ONLY_TAGS.includes(tag)),
  "tfoot",
  "caption",
  "col",
  "colgroup",
  "small",
  "font",
];

export const EMAIL_ATTR = [
  ...ARTICLE_ATTR.filter((attr) => !VIDEO_ONLY_ATTR.includes(attr)),
  // `role="presentation"` sur les tableaux de mise en page : sans lui, un
  // lecteur d'écran annonce la structure de l'habillage comme un tableau de
  // données. Ne décrit que la sémantique, n'exécute rien.
  "role",
  // Attributs de présentation historiques, encore les plus fiables en email.
  "align",
  "valign",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "color",
  "face",
  "size",
];

/** Protocoles acceptés dans un `href` ou un `src` : ni `javascript:`, ni `data:`. */
export const ALLOWED_URL_SCHEMES = ["https", "http", "mailto", "tel"];

export type SanitizePolicy = {
  /** Résumé d'une phrase, toujours visible sous le champ. */
  summary: string;
  tags: string[];
  attributes: string[];
  /** Ce qui est retiré silencieusement à l'enregistrement, et pourquoi. */
  removed: string[];
};

/** Sans `#text`, qui n'est pas une balise que l'auteur écrit. */
function visibleTags(tags: string[]) {
  return tags.filter((tag) => tag !== TEXT_NODE);
}

export const ARTICLE_POLICY: SanitizePolicy = {
  summary:
    "HTML et CSS acceptés : blocs <style>, attributs style= et class= sont conservés. Seul ce qui exécute du code est retiré à l'enregistrement.",
  tags: visibleTags(ARTICLE_TAGS),
  attributes: ARTICLE_ATTR,
  removed: [
    "<script> et les gestionnaires d'événements (onclick, onerror, onload…)",
    "les liens javascript: et data:",
    "les <iframe> autres que YouTube et Vimeo, et les objets embarqués",
    "les balises absentes de la liste ci-dessus (<section>, <center>, <form>…) : seule la balise disparaît, le texte et les balises qu'elle contient sont conservés",
    "en CSS : @import, expression(), behavior:, -moz-binding et url(javascript:) — ce sont des façons d'exécuter du code, pas de mettre en forme",
  ],
};

export const EMAIL_POLICY: SanitizePolicy = {
  summary:
    "HTML et CSS acceptés : blocs <style> et attributs style= sont conservés. Seul ce qui exécute du code est retiré. À savoir : beaucoup de clients mail ignorent <style>, le CSS inline reste le plus fiable.",
  tags: visibleTags(EMAIL_TAGS),
  attributes: EMAIL_ATTR,
  removed: [
    "<script> et les gestionnaires d'événements (onclick, onerror…)",
    "les liens javascript: et data:",
    "les <iframe> et objets embarqués — aucun client mail ne les affiche",
    "les balises absentes de la liste ci-dessus (<section>, <center>, <form>…) : seule la balise disparaît, le texte et les balises qu'elle contient sont conservés",
    "en CSS : @import, expression(), behavior: et -moz-binding",
  ],
};
