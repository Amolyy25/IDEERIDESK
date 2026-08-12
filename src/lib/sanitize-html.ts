import DOMPurify from "isomorphic-dompurify";
import {
  ALLOWED_IFRAME_HOSTS,
  ARTICLE_ATTR,
  ARTICLE_TAGS,
  EMAIL_ATTR,
  EMAIL_TAGS,
} from "@/lib/sanitize-html-policy";
import { sanitizeCssBlock, sanitizeInlineStyle } from "@/lib/sanitize-css";
import { stripScriptTags } from "@/lib/strip-script-tags";

/**
 * Assainissement du HTML riche (articles de la base de connaissances, modèles
 * d'emails) avant stockage ET avant rendu.
 *
 * Ce contenu est rendu via `dangerouslySetInnerHTML` sur des surfaces
 * publiques (page d'un article de FAQ, lien de partage, widget embarqué chez
 * un client) et dans le navigateur d'agents et d'admins. Un `<script>` ou un
 * attribut `onerror` qui y survivrait s'exécuterait donc en même origine que
 * l'application, avec la session de la victime — l'assainissement n'est pas
 * une précaution mais la seule barrière.
 *
 * Deux passes volontairement : à l'écriture (le contenu stocké est déjà sain,
 * donc un futur point de rendu ne peut pas réintroduire la faille) et au
 * rendu (le contenu déjà en base avant ce correctif reste couvert).
 *
 * Les listes blanches vivent dans `sanitize-html-policy.ts`, sans dépendance,
 * pour que les formulaires d'édition puissent annoncer à l'auteur exactement ce
 * qui sera conservé.
 */

// Protocoles de lien : pas de `javascript:` ni de `data:` (un `data:` text/html
// dans un href est un vecteur XSS à part entière).
const SAFE_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

/**
 * Extrait les blocs `<style>` avant le passage de DOMPurify, qui les supprime
 * sans condition (aucune option ne l'en empêche — vérifié).
 *
 * Le contenu extrait est assaini par `sanitizeCssBlock`, qui garantit une sortie
 * sans `<` ni `>` : quoi que cette expression régulière ait capturé, le bloc
 * réinséré ne peut pas se refermer prématurément pour injecter du balisage.
 */
function extractStyleBlocks(html: string): { html: string; css: string[] } {
  const css: string[] = [];
  const stripped = html.replace(STYLE_BLOCK, (_match, content: string) => {
    const clean = sanitizeCssBlock(content);
    if (clean) css.push(clean);
    return "";
  });
  return { html: stripped, css };
}

function withStyleBlocks(sanitizedHtml: string, css: string[]): string {
  if (css.length === 0) return sanitizedHtml;
  return `<style>${css.join("\n")}</style>${sanitizedHtml}`;
}

/**
 * Prépare le HTML pour DOMPurify : scripts découpés au cordeau, blocs `<style>`
 * mis de côté.
 *
 * Le retrait des scripts précède tout, et ce n'est pas une redondance avec
 * `FORBID_TAGS`. Laisser DOMPurify s'en charger seul coûte tout le contenu qui
 * SUIT un `<script>` mal fermé : le parseur HTML lit alors le reste du document
 * comme le texte du script, et il part avec l'élément supprimé. Un article se
 * retrouvait vidé pour une balise oubliée.
 *
 * `stripScriptTags` ne fait que supprimer, il ne peut pas fabriquer de balise,
 * et sa sortie repasse de toute façon par DOMPurify — qui reste la barrière.
 */
function prepare(html: string) {
  return extractStyleBlocks(stripScriptTags(html));
}

let hookInstalled = false;

function installHooks() {
  if (hookInstalled) return;
  hookInstalled = true;

  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const element = node as unknown as Element;
    const src = element.getAttribute?.("src") ?? "";
    let allowed = false;
    try {
      const url = new URL(src);
      allowed = url.protocol === "https:" && ALLOWED_IFRAME_HOSTS.includes(url.hostname);
    } catch {
      allowed = false;
    }
    if (!allowed) element.remove?.();
  });

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const element = node as unknown as Element;

    // `target="_blank"` sans `rel` laisse la page ouverte manipuler l'onglet
    // d'origine via `window.opener`.
    if (element.tagName === "A" && element.getAttribute?.("target")) {
      element.setAttribute("rel", "noopener noreferrer");
    }

    // DOMPurify laisse passer `expression()` et `url(javascript:)` dans un
    // attribut `style` — vérifié. Le filtrage des déclarations est donc à notre
    // charge.
    const style = element.getAttribute?.("style");
    if (style) {
      const clean = sanitizeInlineStyle(style);
      if (clean) element.setAttribute("style", clean);
      else element.removeAttribute("style");
    }
  });
}

/**
 * Profil « article » : HTML et CSS acceptés.
 *
 * Un rédacteur doit pouvoir coller du HTML mis en forme, `<style>` et
 * `style="…"` compris — c'est un choix produit assumé. Conséquence connue : ces
 * règles ne sont pas encapsulées, elles s'appliquent à toute la page qui affiche
 * l'article, et un article partagé publiquement peut donc en changer
 * l'apparence. Acceptable ici parce que seuls des agents approuvés rédigent
 * (permission « kb.manage »).
 *
 * La frontière déplacée est celle du CSS, pas celle du code : ce qui EXÉCUTE
 * reste retiré — script, gestionnaires d'événements, `javascript:`, iframe hors
 * YouTube/Vimeo, et les rares propriétés CSS qui sont en réalité des vecteurs
 * d'exécution, filtrés par `sanitize-css.ts`.
 */
export function sanitizeRichHtml(html: string): string {
  installHooks();
  const extracted = prepare(html);
  const sanitized = DOMPurify.sanitize(extracted.html, {
    ALLOWED_TAGS: ARTICLE_TAGS,
    ALLOWED_ATTR: ARTICLE_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    // Une balise refusée est dépliée, son contenu conservé. L'inverse
    // (`KEEP_CONTENT: false`) emportait le texte avec la balise : un article
    // enveloppé dans un `<center>`, un `<section>` ou un `<form>` — balisage
    // courant dans du HTML collé — s'enregistrait entièrement vide.
    //
    // Le texte d'un `<script>` ne fuit pas pour autant : les scripts sont déjà
    // retirés en amont, et `FORBID_CONTENTS` (script, style, noscript… par
    // défaut dans DOMPurify) couvre ce qui aurait échappé.
    KEEP_CONTENT: true,
    FORBID_TAGS: ["script", "noscript", "form", "input", "button", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "srcdoc", "formaction"],
  });
  return withStyleBlocks(sanitized, extracted.css);
}

/**
 * Profil « email » : garde les styles inline, indispensables à la mise en forme
 * d'un email (les clients mail n'appliquent pas de feuille de style externe, et
 * beaucoup ignorent même un `<style>` dans l'en-tête).
 *
 * Moins strict que le profil article, et c'est justifié par le trajet du
 * contenu : ces gabarits sont écrits par un admin (`requireAdmin`), ne sont
 * jamais injectés dans nos pages via `dangerouslySetInnerHTML` — l'éditeur les
 * analyse en document ProseMirror, il ne les exécute pas — et finissent dans un
 * email, rendu par un client mail qui bloque déjà le script. Ce qui reste
 * interdit est ce qui pourrait s'exécuter : script, gestionnaires d'événements,
 * iframe, objet embarqué.
 *
 * Le CSS est accepté comme côté article, `<style>` compris — à savoir tout de
 * même que beaucoup de clients mail ignorent un bloc `<style>` : le style inline
 * reste le plus fiable pour un email.
 */
export function sanitizeEmailHtml(html: string): string {
  installHooks();
  const extracted = prepare(html);
  const sanitized = DOMPurify.sanitize(extracted.html, {
    ALLOWED_TAGS: EMAIL_TAGS,
    ALLOWED_ATTR: EMAIL_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    // Voir `sanitizeRichHtml` : déplier plutôt que supprimer avec le contenu.
    // Enjeu plus fort encore ici, un gabarit d'email étant presque toujours
    // enveloppé dans un `<center>` ou une table de mise en page.
    KEEP_CONTENT: true,
    FORBID_TAGS: ["script", "noscript", "iframe", "form", "input", "button", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "srcdoc", "formaction"],
  });
  return withStyleBlocks(sanitized, extracted.css);
}
