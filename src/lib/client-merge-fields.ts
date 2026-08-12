/**
 * Le vocabulaire de la fusion de fiches contacts : quels champs s'arbitrent, sous
 * quel libellé, et quand deux valeurs comptent pour la même.
 *
 * Module séparé du moteur (`client-merge.ts`) pour UNE raison, et elle est
 * structurelle : le moteur importe Prisma, et la fenêtre de fusion est un
 * composant client. Y importer le moteur, ne serait-ce que pour une liste de
 * libellés, embarquerait le client de base de données dans le bundle du
 * navigateur. Tout ce qui est partagé entre l'écran et le serveur vit donc ici,
 * sans le moindre accès à la base.
 *
 * Conséquence utile : `sameValue` est écrit une fois. La fenêtre compare des
 * valeurs pour cocher le bon bouton, le serveur compare les mêmes valeurs pour
 * refuser celles qui ne viennent d'aucune fiche — les deux doivent s'accorder au
 * caractère près, sinon un choix légitime de l'agent se fait refuser.
 */

/**
 * Les champs qui s'arbitrent — et pas `email`, volontairement.
 *
 * L'adresse ne se déplace pas d'une fiche à l'autre : elle est unique en base, et
 * la fiche absorbée SURVIT à la fusion (c'est ce qui la rend défaisable, et ce qui
 * fait qu'un email venu de cette adresse retrouve le contact). Déplacer l'adresse
 * violerait donc la contrainte d'unicité.
 *
 * Mais rien n'est perdu pour autant, parce que la question « quelle adresse
 * garder ? » est en réalité la question « quelle fiche reste le contact actif ? ».
 * C'est sous cette forme que la fenêtre la pose, et la réponse choisit la fiche
 * conservée — pas une valeur à recopier. Voir `MergeClientsDialog`.
 */
export const MERGEABLE_FIELDS = ["name", "phone", "company"] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export const MERGEABLE_FIELD_LABELS: Record<MergeableField, string> = {
  name: "Nom",
  phone: "Téléphone",
  company: "Société",
};

/**
 * Nombre maximum de fiches réunies en un seul geste.
 *
 * Pas une limite technique : au-delà, la fenêtre ne montre plus honnêtement ce
 * qu'on s'apprête à détruire, et une fusion qui ne se défait pas ne doit jamais
 * porter sur plus que ce qu'un agent a réellement pu relire. Lu par la fenêtre
 * (qui cesse de proposer l'ajout) ET par le schéma d'entrée de l'action : les
 * deux doivent s'accorder, sinon l'agent bute sur un refus que rien n'annonçait.
 */
export const MAX_CLIENTS_PER_MERGE = 10;

/**
 * Les valeurs que la fiche conservée portera après la fusion, champ par champ.
 *
 * Chacune doit déjà exister sur l'une des fiches fusionnées — c'est vérifié côté
 * serveur, voir `refuseInventedValues`. La fenêtre de fusion est un ARBITRAGE
 * entre des valeurs existantes, pas un formulaire d'édition.
 */
export type ClientMergeSelection = {
  name: string;
  phone: string | null;
  company: string | null;
};

/**
 * Forme comparable d'une valeur.
 *
 * Les espaces de bord disparaissent parce que le schéma d'entrée les a déjà
 * retirés du côté choisi, et qu'une vieille ligne peut en porter. `null` et la
 * chaîne vide se confondent : « pas de téléphone » ne se décline pas en deux
 * états.
 */
export function normalizeFieldValue(value: string | null): string {
  return (value ?? "").trim();
}

/** Deux valeurs d'un même champ que l'utilisateur tiendrait pour identiques. */
export function sameValue(a: string | null, b: string | null): boolean {
  return normalizeFieldValue(a) === normalizeFieldValue(b);
}

/** Deux adresses email que le fournisseur de messagerie tiendrait pour la même boîte. */
export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
