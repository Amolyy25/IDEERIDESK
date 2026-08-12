/**
 * Suppression textuelle des éléments `<script>`, sans dépendance.
 *
 * Isolé ici parce que deux appelants en ont besoin de part et d'autre de la
 * frontière client/serveur : `sanitize-html.ts` (qui tire DOMPurify et jsdom,
 * absents du bundle client) et l'éditeur riche, où le collage de HTML retire le
 * JS par confort d'édition. Une seule règle, donc un seul comportement observé
 * par l'utilisateur, quel que soit le chemin emprunté par son contenu.
 *
 * ATTENTION : ce n'est PAS la barrière de sécurité. Un filtrage par expression
 * régulière sur du HTML ne peut pas l'être. La barrière est `sanitizeRichHtml` /
 * `sanitizeEmailHtml`, appliquée à l'enregistrement et au rendu. Le rôle de ce
 * module est de préserver le contenu légitime AUTOUR du script : coupé au
 * cordeau ici, il ne peut plus être emporté par le parseur en aval.
 */

const SCRIPT_ELEMENT = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

// Balise ouvrante sans fermante : son texte court jusqu'au balisage suivant, pas
// jusqu'à la fin du document — c'est exactement la différence entre perdre le
// script et perdre l'article.
const ORPHAN_SCRIPT_OPEN = /<script\b[^>]*>[^<]*/gi;

const ORPHAN_SCRIPT_CLOSE = /<\/script\s*>/gi;

/**
 * Retire chaque `<script>` de sa balise ouvrante à sa fermante, et rien d'autre.
 *
 * Cette fonction ne fait que supprimer, jamais insérer : elle ne peut pas
 * fabriquer de balise. Une suppression peut en revanche en RECOLLER une —
 * `<scr<script></script>ipt>` redevient `<script>` une fois le milieu retiré —
 * d'où la boucle jusqu'à stabilité. Elle termine : chaque tour raccourcit
 * strictement la chaîne.
 */
export function stripScriptTags(html: string): string {
  let current = html;
  let previous: string;
  do {
    previous = current;
    current = current.replace(SCRIPT_ELEMENT, "");
  } while (current !== previous);
  return current.replace(ORPHAN_SCRIPT_OPEN, "").replace(ORPHAN_SCRIPT_CLOSE, "");
}
