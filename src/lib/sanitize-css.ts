import postcss from "postcss";

/**
 * Assainissement du CSS rédigé dans un article ou un gabarit d'email.
 *
 * Le CSS est volontairement accepté (un rédacteur doit pouvoir coller du HTML
 * mis en forme), mais quelques constructions CSS ne mettent rien en forme : ce
 * sont des façons d'exécuter du code ou d'appeler un serveur distant. Elles sont
 * retirées ici, avec un vrai parseur plutôt qu'une expression régulière — un
 * `expression(/**\/alert(1))` ou une valeur découpée par un commentaire CSS
 * échappe à une regex, pas à un parseur.
 *
 * DOMPurify ne peut pas s'en charger : il supprime les éléments `<style>` sans
 * condition, quelle que soit sa configuration. Le contenu des blocs `<style>`
 * est donc extrait, nettoyé ici, puis réinséré (voir `sanitize-html.ts`).
 */

// `@import` charge une feuille distante : fuite de la visite vers un tiers, et
// contenu que nous n'avons pas assaini. Les autres règles @ listées ne font que
// de la mise en forme.
const ALLOWED_AT_RULES = new Set([
  "media",
  "supports",
  "font-face",
  "keyframes",
  "-webkit-keyframes",
  "-moz-keyframes",
  "layer",
  "page",
  "container",
]);

// Propriétés qui exécutent du code (IE et Firefox anciens). Aucune n'a d'usage
// de mise en forme.
const FORBIDDEN_PROPERTIES = new Set(["behavior", "-moz-binding", "-ms-behavior"]);

// Valeurs qui exécutent du code ou chargent un script.
const FORBIDDEN_VALUE = /expression\s*\(|url\s*\(\s*["']?\s*(?:javascript|vbscript|data)\s*:/i;

/**
 * Un commentaire CSS peut découper un mot-clé : `expr/**\/ession(alert(1))` est
 * lu comme `expression(...)` par les moteurs qui retirent les commentaires
 * avant l'analyse. Le filtrage se fait donc sur la valeur commentaires retirés,
 * et c'est cette version normalisée qui est conservée — garder l'originale
 * reviendrait à stocker la charge intacte.
 */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

function normalize(text: string) {
  return text.replace(CSS_COMMENT, "");
}

function isForbiddenDeclaration(prop: string, value: string) {
  return (
    FORBIDDEN_PROPERTIES.has(normalize(prop).toLowerCase().trim()) ||
    FORBIDDEN_VALUE.test(normalize(value))
  );
}

/**
 * Dernier verrou avant réinsertion dans un `<style>` : du CSS n'a jamais besoin
 * de `<` ni de `>`. Les retirer rend impossible une sortie du bloc de style du
 * type `</style><script>`, quelle que soit la façon dont le parseur a interprété
 * l'entrée.
 */
function stripMarkupCharacters(css: string) {
  return css.replace(/[<>]/g, "");
}

function sanitizeRoot(css: string): string {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    // CSS illisible : on préfère ne rien conserver plutôt que réinsérer une
    // chaîne dont on ne sait pas ce qu'elle contient.
    return "";
  }

  root.walkAtRules((rule) => {
    if (!ALLOWED_AT_RULES.has(rule.name.toLowerCase())) rule.remove();
  });

  root.walkDecls((decl) => {
    if (isForbiddenDeclaration(decl.prop, decl.value)) {
      decl.remove();
      return;
    }
    decl.prop = normalize(decl.prop);
    decl.value = normalize(decl.value);
  });

  // Un commentaire autonome ne sert à rien au rendu.
  root.walkComments((comment) => {
    comment.remove();
  });

  return stripMarkupCharacters(root.toString()).trim();
}

/** Contenu d'un bloc `<style>` : règles complètes avec sélecteurs. */
export function sanitizeCssBlock(css: string): string {
  return sanitizeRoot(css);
}

/**
 * Valeur d'un attribut `style="…"` : une liste de déclarations sans sélecteur.
 * Elle est enveloppée dans une règle factice pour être analysable, puis
 * ré-extraite.
 */
export function sanitizeInlineStyle(value: string): string {
  if (!value.trim()) return "";

  let root: postcss.Root;
  try {
    root = postcss.parse(`*{${value}}`);
  } catch {
    return "";
  }

  const kept: string[] = [];
  root.walkDecls((decl) => {
    if (isForbiddenDeclaration(decl.prop, decl.value)) return;
    kept.push(
      `${normalize(decl.prop)}:${normalize(decl.value)}${decl.important ? " !important" : ""}`
    );
  });

  return stripMarkupCharacters(kept.join(";"));
}
