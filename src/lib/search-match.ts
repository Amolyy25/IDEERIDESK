// Comparaison de termes de recherche côté navigateur : palette (⌘K) et plan de
// navigation. Sans accents ni casse, et mot à mot — « base conn » doit trouver
// « Base de connaissances », « setting » doit trouver « /settings ».

export function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Vrai si chaque mot du terme se retrouve dans au moins un des champs. */
export function matchesQuery(fields: (string | null | undefined)[], query: string) {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = fields
    .filter((field): field is string => Boolean(field))
    .map(normalizeForSearch)
    .join(" ");
  return words.every((word) => haystack.includes(word));
}
