// Vérifie que chaque Server Action exportée porte une garde d'accès.
//
// Une action exportée depuis un module `"use server"` est un endpoint HTTP :
// c'est le motif qui a produit la faille la plus large de cette base (lecture et
// suppression de tickets et de clients par un appelant sans droit). Le contrôle
// est ici statique et sans base de données, pour qu'il tourne en CI et échoue
// au moment où un nouvel export est ajouté sans garde.
//
// Usage : node scripts/check-action-guards.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ACTIONS_DIR = "src/lib/actions";
const GUARDS = [
  "requireApprovedAgent",
  "requireCanRespond",
  "requireCanApprove",
  "requireAdmin",
];

/**
 * Actions volontairement ouvertes, avec la raison. Toute entrée ajoutée ici est
 * une décision à assumer : elle est appelable par un anonyme.
 */
const INTENTIONALLY_PUBLIC = new Map([
  ["categories.ts:getTicketCategories", "liste déroulante des formulaires publics"],
  ["custom-fields.ts:getCustomFields", "champs des formulaires publics"],
  ["settings.ts:getGlobalSettings", "bandeau du widget ; les clés IA sont exclues côté requête"],
  ["sources.ts:getSourceForm", "configuration du formulaire public d'une source"],
  ["portal-settings.ts:getPortalSettings", "thème et textes du portail public"],
  ["knowledge-base.ts:getPublishedArticlesByCategory", "FAQ publique"],
  ["knowledge-base.ts:getPublishedArticleBySlug", "page publique d'un article"],
  ["knowledge-base.ts:searchPublishedArticles", "recherche du widget public"],
  ["knowledge-base.ts:getArticleByShareToken", "entrée d'un lien de partage ; portée vérifiée par la page"],
]);

/**
 * Corps de la fonction, du `{` ouvrant à son `}` correspondant.
 *
 * La liste de paramètres est franchie d'abord : `f(filters = {})` et
 * `f(input: { name: string })` contiennent des accolades qui ne sont pas le
 * corps — les prendre pour tel faisait passer des fonctions correctement
 * gardées pour des fonctions sans garde.
 */
function functionBody(source, startIndex) {
  const paramsOpen = source.indexOf("(", startIndex);
  if (paramsOpen === -1) return "";
  let parenDepth = 0;
  let paramsClose = -1;
  for (let i = paramsOpen; i < source.length; i += 1) {
    if (source[i] === "(") parenDepth += 1;
    else if (source[i] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        paramsClose = i;
        break;
      }
    }
  }
  if (paramsClose === -1) return "";

  const open = source.indexOf("{", paramsClose);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

const problems = [];
let checked = 0;

for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts")).sort()) {
  const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
  if (!source.includes('"use server"')) continue;

  const pattern = /export\s+async\s+function\s+([A-Za-z0-9_]+)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    const key = `${file}:${name}`;
    checked += 1;

    if (INTENTIONALLY_PUBLIC.has(key)) continue;

    const body = functionBody(source, match.index + match[0].length);
    if (!GUARDS.some((guard) => body.includes(`${guard}(`))) {
      problems.push(key);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `Server Actions sans garde d'accès (${problems.length}) — ajoutez une garde de ` +
      `@/lib/require-permission en première instruction, ou justifiez l'ouverture ` +
      `dans INTENTIONALLY_PUBLIC :`
  );
  for (const problem of problems) console.error(`  - ${ACTIONS_DIR}/${problem}`);
  process.exit(1);
}

console.log(`${checked} Server Actions vérifiées : toutes gardées ou explicitement publiques.`);
