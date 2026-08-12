/**
 * Repérage des fiches contacts qui désignent la même personne.
 *
 * Module volontairement PUR — aucune requête, aucun accès à la base : il tourne
 * sur la liste que la page `/clients` a déjà chargée, et il est importé par un
 * composant client (la fenêtre de fusion) comme par le serveur. Une requête de
 * plus n'apporterait rien : le répertoire est servi en entier. À revoir le jour
 * où cette liste sera paginée — la détection ne verrait alors qu'une page, et
 * annoncerait « aucun doublon » en n'ayant regardé qu'un dixième du répertoire.
 *
 * DEUX SIGNAUX, et deux seulement :
 *
 * 1. **L'email équivalent.** `Client.email` est unique en base : deux fiches ne
 *    peuvent pas porter la MÊME adresse, la question ne se pose donc que pour
 *    des adresses qui désignent la même boîte sans être identiques —
 *    « jean+support@ex.com », « Jean.Dupont@gmail.com » vs « jeandupont@gmail.com ».
 *    C'est le signal fort : une correspondance ici est presque toujours vraie.
 *
 * 2. **Le nom et le prénom identiques.** Signal faible, volontairement bridé
 *    (voir `nameIdentity`) : deux personnes peuvent porter le même nom. Il
 *    PROPOSE un rapprochement, il ne le décide pas — c'est l'agent qui tranche
 *    dans la fenêtre de fusion.
 *
 * Le TÉLÉPHONE n'est délibérément pas un signal. Un standard d'agence est
 * partagé par le gérant, les négociateurs et l'assistante : rapprocher sur ce
 * critère proposerait de fusionner quatre personnes différentes, ce qui est
 * exactement l'erreur qu'une fusion ne pardonne pas.
 */

// ---------------------------------------------------------------------------
// Ce que la détection a besoin de connaître d'une fiche
// ---------------------------------------------------------------------------

/**
 * Le minimum exigé d'une fiche : de quoi la reconnaître, la dater et savoir si
 * son identité a déjà été effacée. Écrit en type structurel plutôt qu'en
 * `Client` complet pour que l'appelant passe ce qu'il a — la page passe des
 * lignes qui portent en plus le compte de tickets.
 */
export type DuplicateCandidate = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  /** Voir `Client.anonymizedAt` : une identité effacée ne se rapproche plus. */
  anonymizedAt: Date | null;
  /**
   * Voir `Client.mergedIntoId` : une fiche déjà rattachée à un contact a été
   * traitée, il n'y a plus rien à proposer à son sujet.
   */
  mergedIntoId: string | null;
};

/** Pourquoi deux fiches ont été rapprochées — affiché tel quel à l'agent. */
export type DuplicateReason = "EMAIL" | "NAME";

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  EMAIL: "Même adresse email",
  NAME: "Même nom et prénom",
};

export type ClientDuplicateGroup<T extends DuplicateCandidate> = {
  /** Stable d'un rendu à l'autre : les identifiants des membres, triés. */
  key: string;
  /** Les deux motifs quand le groupe est rapproché par l'email ET par le nom. */
  reasons: DuplicateReason[];
  /** La plus ancienne d'abord : c'est celle que la fusion conserve. */
  members: T[];
};

// ---------------------------------------------------------------------------
// Empreinte d'une adresse email
// ---------------------------------------------------------------------------

/**
 * Domaines dont le fournisseur ignore les points de la partie locale.
 *
 * Restreint volontairement à Google, qui le documente : chez la plupart des
 * autres fournisseurs, « j.dupont@ » et « jdupont@ » sont deux boîtes
 * distinctes, et les confondre proposerait de fusionner deux personnes.
 */
const DOTLESS_LOCAL_DOMAINS = new Set(["gmail.com"]);

/** Domaines qui sont un alias d'un autre : la même boîte sous deux noms. */
const DOMAIN_ALIASES: Record<string, string> = { "googlemail.com": "gmail.com" };

/**
 * Forme canonique d'une adresse : ce qui reste quand on retire ce qui ne change
 * pas la boîte destinataire.
 *
 * Le suffixe `+quelque-chose` est retiré chez TOUS les fournisseurs : c'est une
 * convention si répandue qu'une adresse qui en porte un est presque toujours un
 * marquage volontaire de la même personne. Retiré seulement s'il ne vide pas la
 * partie locale — une adresse qui commencerait par « + » n'a pas de raison
 * d'être réduite à rien.
 */
export function emailIdentity(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return trimmed;

  let local = trimmed.slice(0, at);
  const rawDomain = trimmed.slice(at + 1);
  const domain = DOMAIN_ALIASES[rawDomain] ?? rawDomain;

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOTLESS_LOCAL_DOMAINS.has(domain)) local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

// ---------------------------------------------------------------------------
// Empreinte d'un nom
// ---------------------------------------------------------------------------

/**
 * Civilités écartées avant comparaison : « M. Jean Dupont » et « Jean Dupont »
 * sont la même personne, et l'un des deux canaux a très bien pu la saisir avec.
 */
const CIVILITIES = new Set([
  "m",
  "mr",
  "mme",
  "mlle",
  "me",
  "dr",
  "monsieur",
  "madame",
  "mademoiselle",
  "maitre",
  "docteur",
]);

/**
 * Forme canonique d'un nom, ou `null` quand il ne doit pas servir au
 * rapprochement.
 *
 * Trois refus, et chacun évite un faux positif observable :
 *
 * — **Le nom qui est une adresse.** Une fiche créée par la synchro Gmail ou par
 *   le widget sans nom saisi porte l'ADRESSE en guise de nom (voir
 *   `createTicketFromInboundEmail`). Ce n'est pas une identité, c'est un
 *   bouche-trou : le comparer n'apprend rien et le montrer comme « même nom »
 *   serait mensonger.
 *
 * — **Le nom en un seul mot.** « Compta », « Support », « Agence » : deux
 *   sociétés différentes ont chacune leur « Compta », et les rapprocher
 *   proposerait de fusionner deux personnes qui n'ont rien à voir. La demande
 *   porte sur le nom ET le prénom — deux mots au minimum, donc.
 *
 * — **Le nom vide après nettoyage.** Une fiche nommée « M. » ou « --- ».
 *
 * Les mots sont TRIÉS avant d'être recollés : « Dupont Jean » et « Jean Dupont »
 * sont la même personne saisie dans deux ordres, ce qui est le cas le plus
 * fréquent entre un formulaire (prénom d'abord) et un annuaire (nom d'abord).
 */
export function nameIdentity(name: string): string | null {
  if (name.includes("@")) return null;

  const tokens = name
    // NFD sépare la lettre de son accent, la plage suivante retire l'accent :
    // « Frédéric » et « Frederic » doivent se rapprocher.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Traits d'union, apostrophes et points deviennent des séparateurs :
    // « Jean-Pierre O'Neil » et « Jean Pierre O Neil » sont la même personne.
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0 && !CIVILITIES.has(token));

  if (tokens.length < 2) return null;

  return [...tokens].sort().join(" ");
}

// ---------------------------------------------------------------------------
// Groupes
// ---------------------------------------------------------------------------

/** Groupes d'au moins deux membres, indexés par leur empreinte. */
function groupsOf<T extends DuplicateCandidate>(
  clients: readonly T[],
  fingerprint: (client: T) => string | null,
): T[][] {
  const buckets = new Map<string, T[]>();

  for (const client of clients) {
    const key = fingerprint(client);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(client);
    else buckets.set(key, [client]);
  }

  return [...buckets.values()].filter((bucket) => bucket.length > 1);
}

/**
 * Les fiches du répertoire qui semblent désigner la même personne.
 *
 * Un même contact peut apparaître dans DEUX groupes — rapproché de l'un par
 * l'adresse, d'un autre par le nom — et c'est voulu : ce sont deux
 * rapprochements différents, à trancher séparément. Seuls les groupes dont
 * l'ensemble des membres est identique sont réunis en une ligne, avec les deux
 * motifs : l'agent n'a alors rien de plus à décider.
 *
 * DEUX EXCLUSIONS avant tout calcul :
 *
 * — Les fiches ANONYMISÉES. Leur adresse est en `.invalid` et leur nom est un
 *   pseudonyme : elles ne se rapprocheraient de rien par accident, mais les
 *   proposer serait pire qu'inutile — fusionner une identité effacée dans une
 *   identité vivante défait l'effacement.
 *
 * — Les fiches DÉJÀ RATTACHÉES à un contact par une fusion. Le rapprochement a
 *   été fait, et le proposer à nouveau ferait réapparaître chaque jour un
 *   doublon que l'équipe croyait traité — c'est le reproche le plus sûr qu'on
 *   puisse faire à une détection automatique. Elles restent dans le répertoire,
 *   signalées comme rattachées, avec de quoi les détacher.
 */
export function findClientDuplicateGroups<T extends DuplicateCandidate>(
  clients: readonly T[],
): ClientDuplicateGroup<T>[] {
  const candidates = clients.filter(
    (client) => client.anonymizedAt === null && client.mergedIntoId === null,
  );

  /** Clé de groupe = les identifiants des membres, triés. */
  const keyOf = (members: readonly T[]) =>
    members
      .map((member) => member.id)
      .sort()
      .join("|");

  const groups = new Map<string, ClientDuplicateGroup<T>>();

  const collect = (buckets: T[][], reason: DuplicateReason) => {
    for (const bucket of buckets) {
      const key = keyOf(bucket);
      const existing = groups.get(key);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        continue;
      }
      groups.set(key, {
        key,
        reasons: [reason],
        members: [...bucket].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
      });
    }
  };

  // L'email d'abord : c'est le motif le plus sûr, et l'ordre de collecte fixe
  // l'ordre des motifs affichés pour un groupe rapproché par les deux.
  collect(groupsOf(candidates, (client) => emailIdentity(client.email)), "EMAIL");
  collect(groupsOf(candidates, (client) => nameIdentity(client.name)), "NAME");

  return [...groups.values()].sort((a, b) => {
    // Les rapprochements par email en tête : ce sont ceux qu'un agent peut
    // trancher sans réfléchir, autant qu'ils ne soient pas noyés sous les
    // homonymes.
    const aEmail = a.reasons.includes("EMAIL") ? 0 : 1;
    const bEmail = b.reasons.includes("EMAIL") ? 0 : 1;
    if (aEmail !== bEmail) return aEmail - bEmail;
    if (a.members.length !== b.members.length) return b.members.length - a.members.length;
    return a.members[0].name.localeCompare(b.members[0].name, "fr");
  });
}
