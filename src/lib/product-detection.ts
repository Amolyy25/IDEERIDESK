import { prisma } from "@/lib/prisma";

/**
 * Reconnaissance du produit concerné à la lecture d'un email entrant.
 *
 * Un email n'a pas de liste déroulante : contrairement au widget ou au portail,
 * le client écrit en clair et le ticket arrive sans produit. Or c'est le produit
 * qui décide de tout le reste — quelle file voit le ticket (voir
 * `notifyQueueOnNewTicket`), quelles réponses type sont proposées. Le laisser
 * vide, c'est laisser le ticket dans « Non assignés » jusqu'à ce qu'un agent
 * passe le trier à la main.
 *
 * Le tri se fait sur des mots, pas sur le nom exact du produit : personne
 * n'écrit « App compagnon » dans un mail, on écrit « le compagnon ne se
 * synchronise plus ». Ces mots sont un réglage porté par le produit lui-même
 * (`TicketCategory.emailKeywords`, saisi dans /settings/categories) et non une
 * table écrite dans le code : la version précédente rattachait par nom de
 * produit, si bien qu'un produit renommé depuis l'écran de paramétrage voyait sa
 * règle cesser d'agir sans que rien ne le signale.
 */

/** Un produit et les mots qui le désignent, tels que lus en base. */
export type ProductKeywordRule = {
  id: string;
  name: string;
  keywords: string[];
};

/** Minuscules, sans accents et sans blancs superflus : « Compagnon », « COMPAGNON » et « compagnôn » sont le même mot. */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Les retours à la ligne d'un email sont posés par le client de messagerie,
    // pas par l'auteur : sans ça, un mot-clé en deux mots ne serait pas reconnu
    // quand le pli tombe au milieu.
    .replace(/\s+/g, " ")
    .trim();
}

/** Échappe ce qui, dans un mot-clé, serait lu comme une syntaxe d'expression régulière. */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Le mot-clé apparaît-il comme un mot, et non comme une syllabe ?
 *
 * `\b` ne conviendrait pas : il considère l'underscore comme une lettre et
 * traite mal les mots-clés contenant une espace. Les bornes sont donc posées à
 * la main sur les caractères alphanumériques — ce qui laisse passer les points
 * et les tirets, et permet de reconnaître le produit dans une adresse comme
 * « app.ideeri.fr ».
 */
function mentions(text: string, keyword: string) {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword)}(?![a-z0-9])`).test(text);
}

/**
 * Produit désigné par un email, ou `null` si aucun mot-clé n'y figure.
 *
 * Séparé de la lecture en base pour rester vérifiable sur des chaînes seules.
 *
 * L'objet est examiné avant le corps : c'est là que le client résume sa demande,
 * alors que le corps peut citer un autre produit en passant (« comme sur
 * Papiris, l'appli compagnon… »). Un mot-clé rencontré dans l'objet l'emporte
 * donc sur n'importe quel mot-clé du corps.
 *
 * À égalité — deux produits nommés dans la même partie du message —, c'est
 * l'ordre d'affichage de /settings/categories qui tranche, le premier de la
 * liste l'emportant. Cet ordre sert donc aussi de priorité : le produit le plus
 * général se range en bas, pour ne servir que quand rien de plus précis n'a été
 * reconnu.
 */
export function matchProductRules({
  rules,
  subject,
  body,
}: {
  rules: ProductKeywordRule[];
  subject: string | null;
  body: string;
}): ProductKeywordRule | null {
  const prepared = rules
    .map((rule) => ({
      rule,
      // Un mot-clé vide passerait partout : il ferait de son produit le produit
      // de tous les emails. La saisie le refuse déjà, la reprise de données
      // aussi, mais la règle ne coûte rien à poser ici.
      keywords: rule.keywords.map(normalize).filter(Boolean),
    }))
    .filter((entry) => entry.keywords.length > 0);

  for (const haystack of [normalize(subject ?? ""), normalize(body)]) {
    if (!haystack) continue;
    for (const { rule, keywords } of prepared) {
      if (keywords.some((keyword) => mentions(haystack, keyword))) return rule;
    }
  }

  return null;
}

/**
 * Produit reconnu dans un email, ou `null` si aucun mot-clé n'a été rencontré —
 * auquel cas le ticket reste sans produit, comme avant, et part au tri manuel.
 *
 * Seuls les produits qui ont des mots-clés sont chargés : un produit sans
 * paramétrage ne peut pas être posé automatiquement, et n'a donc rien à faire
 * dans la comparaison.
 */
export async function detectProductFromEmail({
  subject,
  body,
}: {
  subject: string | null;
  body: string;
}): Promise<{ id: string; name: string } | null> {
  const products = await prisma.ticketCategory.findMany({
    where: { emailKeywords: { isEmpty: false } },
    select: { id: true, name: true, emailKeywords: true },
    orderBy: { order: "asc" },
  });

  const match = matchProductRules({
    rules: products.map((product) => ({
      id: product.id,
      name: product.name,
      keywords: product.emailKeywords,
    })),
    subject,
    body,
  });

  return match ? { id: match.id, name: match.name } : null;
}
