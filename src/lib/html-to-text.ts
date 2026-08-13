/**
 * Retranscription en texte brut d'un fragment HTML, structure conservée.
 *
 * Un message écrit en éditeur riche doit exister sous deux formes : le HTML pour
 * l'affichage et l'email, et un texte lisible pour tout le reste — recherche,
 * export CSV, dossier RGPD, contexte IA, historique en bas des emails, partie
 * text/plain de l'email. Cette fonction produit la seconde à partir de la
 * première.
 *
 * Elle diffère de `htmlToPlainText` (article-html.ts), qui aplatit tout sur une
 * ligne pour des aperçus d'une ou deux lignes : ici les paragraphes, les sauts
 * de ligne et les listes doivent rester lisibles, c'est un contenu qu'un client
 * va vraiment lire dans sa boîte mail s'il ne reçoit pas le HTML.
 *
 * Module sans dépendance, importable des deux côtés.
 */

/** Entités nommées produites par un éditeur ou un copier-coller courant. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ugrave: "ù",
  ocirc: "ô",
  ecirc: "ê",
  euro: "€",
};

/**
 * Passe UNIQUE sur les entités : décoder `&amp;` puis les autres transformerait
 * `&amp;lt;` — écrit par un client qui parle d'une balise — en `<`, et l'ordre
 * inverse a le même défaut. Rien de ce qui est écrit ici n'est réinterprété.
 */
function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const codePoint = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      // Un point de code hors plage ferait lever `fromCodePoint` : le fragment
      // est alors laissé tel quel plutôt que d'emporter toute la conversion.
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<!--[\s\S]*?-->/g, "")
    // Contenu non rédactionnel : la balise ET ce qu'elle contient. Retirer la
    // seule balise ferait apparaître les règles CSS en toutes lettres.
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n———\n")
    // Puce ouvrante posée avant le retrait des balises : une liste sans marqueur
    // se lit comme une suite de phrases sans lien. Les listes numérotées
    // reçoivent le même tiret — restituer le rang demanderait de compter les
    // éléments, pour un gain nul dans un repli texte.
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/li\s*>/gi, "\n")
    // Fin de bloc = ligne vide : c'est ce qui sépare deux paragraphes.
    .replace(/<\/(p|div|h[1-6]|blockquote|pre|tr|table|ul|ol)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(withBreaks)
    // Espace insécable ramenée à une espace ordinaire : invisible à l'écran,
    // elle casse en revanche les comparaisons et la recherche plein texte.
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
