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
 * synchronise plus ». Les noms de produits, eux, restent la clé de rattachement
 * — la règle ne pose rien que le paramétrage ne connaisse pas déjà.
 */

type ProductRule = {
  /** Nom du produit concerné tel qu'il figure dans /settings/categories. */
  productName: string;
  /**
   * Mots qui désignent ce produit dans un email. Comparés hors casse et hors
   * accents, sur des mots entiers : « papiris » ne se déclenche pas au milieu
   * d'un autre mot, mais se déclenche dans « papiris.fr ».
   */
  keywords: string[];
};

/**
 * L'ordre est une priorité, pas une préférence de lecture : un mail qui parle
 * de Papairis *et* signe « l'équipe Ideeri » doit devenir un ticket Papairis.
 * Le mot le plus général passe donc en dernier, pour ne servir que quand rien
 * de plus précis n'a été reconnu.
 */
const PRODUCT_RULES: ProductRule[] = [
  { productName: "Papairis", keywords: ["papairis", "papiris"] },
  { productName: "App compagnon", keywords: ["compagnon"] },
  { productName: "App Ideeri", keywords: ["ideeri", "ideeri desk"] },
];

/** Minuscules et sans accents : « Compagnon », « COMPAGNON » et « compagnôn » sont le même mot. */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
 * Produit reconnu dans un email, ou `null` si aucun mot-clé n'a été rencontré —
 * auquel cas le ticket reste sans produit, comme avant, et part au tri manuel.
 *
 * L'objet est examiné avant le corps : c'est là que le client résume sa demande,
 * alors que le corps peut citer un autre produit en passant (« comme sur
 * Papairis, l'appli compagnon… »). Une règle qui frappe dans l'objet l'emporte
 * donc sur n'importe quelle règle du corps.
 */
export async function detectProductFromEmail({
  subject,
  body,
}: {
  subject: string | null;
  body: string;
}): Promise<{ id: string; name: string } | null> {
  const haystacks = [normalize(subject ?? ""), normalize(body)];

  const matchedNames: string[] = [];
  for (const haystack of haystacks) {
    for (const rule of PRODUCT_RULES) {
      if (rule.keywords.some((keyword) => mentions(haystack, normalize(keyword)))) {
        matchedNames.push(rule.productName);
      }
    }
    if (matchedNames.length > 0) break;
  }

  if (matchedNames.length === 0) return null;

  // Les produits sont lus en base et non déduits des règles : un produit
  // renommé ou supprimé dans /settings/categories ne doit pas faire échouer la
  // création du ticket, seulement priver la règle d'effet. La comparaison est
  // normalisée pour survivre à une majuscule ou une espace de trop dans le
  // paramétrage.
  const products = await prisma.ticketCategory.findMany({ select: { id: true, name: true } });
  const byNormalizedName = new Map(products.map((p) => [normalize(p.name).trim(), p]));

  for (const name of matchedNames) {
    const product = byNormalizedName.get(normalize(name).trim());
    if (product) return product;
  }

  return null;
}
