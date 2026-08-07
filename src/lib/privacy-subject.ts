/**
 * Ce qu'est une « personne concernée » pour cette application, et sous quelle
 * forme son identité disparaît.
 *
 * Module volontairement PUR — aucune requête, aucun accès à la base : il est lu
 * par le tableau de l'écran (composant client), par les Server Actions, par la
 * route d'export et par la réécriture du journal. Toutes doivent s'accorder sur
 * la même définition du pseudonyme, sans quoi une identité effacée d'un côté
 * réapparaîtrait de l'autre.
 *
 * Deux personnes concernées, et pas une seule : un CLIENT (contact à l'origine
 * des tickets) et un AGENT (membre de l'équipe). Le second est souvent oublié
 * dans ce genre d'écran alors qu'il est la personne dont l'application garde le
 * relevé le plus détaillé — le journal d'audit trace chacune de ses
 * consultations.
 */

export const SUBJECT_KINDS = ["CLIENT", "AGENT"] as const;

export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const SUBJECT_KIND_LABELS: Record<SubjectKind, string> = {
  CLIENT: "Client",
  AGENT: "Membre de l'équipe",
};

export function isSubjectKind(value: string): value is SubjectKind {
  return (SUBJECT_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Forme du pseudonyme
// ---------------------------------------------------------------------------

/**
 * Domaine réservé par la RFC 2606 : une adresse en `.invalid` ne peut, par
 * définition, jamais désigner une vraie boîte. C'est la garantie qu'une identité
 * effacée ne redevient pas un destinataire par accident — ni pour un envoi
 * automatique, ni pour le rapprochement par email de la synchro Gmail.
 */
const PSEUDONYM_EMAIL_DOMAIN = "ideeri.invalid";

/**
 * Identité de remplacement d'une personne effacée.
 *
 * Un pseudonyme et non un vide : le nom sert encore à lire une ligne de journal
 * (« quelqu'un a consulté ce dossier »), et le suffixe permet de distinguer deux
 * personnes anonymisées l'une de l'autre sans en nommer aucune. Il est dérivé de
 * l'identifiant technique, qui ne dit rien de la personne — et qui a disparu avec
 * la fiche quand l'anonymisation précède une suppression.
 *
 * L'email reprend l'identifiant COMPLET, lui, parce qu'il est soumis à une
 * contrainte d'unicité en base : six caractères pourraient collisionner, et un
 * second effacement échouerait alors sur une violation de contrainte.
 *
 * ATTENTION : ces deux formes sont vérifiées par le déclencheur Postgres du
 * journal (migration `20260807120100_privacy_subject_rights`). Les changer ici
 * sans changer le `LIKE` de la migration fait échouer toute anonymisation.
 */
export function subjectPseudonym(id: string): { name: string; email: string } {
  return {
    name: `Personne anonymisée (${id.slice(-6)})`,
    email: `anonyme-${id}@${PSEUDONYM_EMAIL_DOMAIN}`,
  };
}

/** Une identité déjà remplacée : sert à ne pas proposer deux fois le geste. */
export function isPseudonymEmail(email: string): boolean {
  return email.endsWith(`@${PSEUDONYM_EMAIL_DOMAIN}`);
}

// ---------------------------------------------------------------------------
// Reconnaissance d'une identité dans du texte
// ---------------------------------------------------------------------------

/**
 * Longueur en dessous de laquelle un nom n'est plus cherché dans du texte libre.
 *
 * Un nom de deux ou trois lettres (« Li », « Bob ») se retrouve à l'intérieur de
 * phrases qui ne parlent pas de la personne ; le remplacer abîmerait des traces
 * sans rien protéger. L'email, lui, est toujours cherché : il est unique par
 * construction. Le nom trop court est signalé à l'écran plutôt que traité en
 * silence — c'est le seul cas où l'effacement reste partiel sans qu'on puisse
 * l'automatiser.
 */
export const MIN_SEARCHABLE_NAME_LENGTH = 4;

export function isSearchableName(name: string): boolean {
  return name.trim().length >= MIN_SEARCHABLE_NAME_LENGTH;
}

// ---------------------------------------------------------------------------
// Ce que l'écran affiche d'une personne
// ---------------------------------------------------------------------------

/**
 * Une personne trouvée par la recherche, avec de quoi décider avant d'agir :
 * combien de tickets et combien de lignes de journal seront touchés, et si son
 * identité a déjà été effacée.
 */
export type SubjectSummary = {
  kind: SubjectKind;
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  createdAt: Date;
  anonymizedAt: Date | null;
  /** Tickets dont elle est le demandeur (client) ou l'assigné (agent). */
  ticketCount: number;
  /** Lignes du journal dont elle est l'auteur (agent) ou qui visent ses tickets (client). */
  journalEntryCount: number;
  /** Agent seulement : un compte encore ouvert ne doit pas s'effacer par surprise. */
  isActive: boolean | null;
  /** Agent seulement, libellé lisible du rôle. */
  roleLabel: string | null;
};

/** Lien de l'export — une seule action, donc un seul GET à construire. */
export function subjectExportHref(kind: SubjectKind, id: string): string {
  return `/api/privacy/export?kind=${kind}&id=${encodeURIComponent(id)}`;
}

/** Nom de fichier daté : deux remises successives ne doivent pas s'écraser. */
export function subjectExportFilename(kind: SubjectKind, id: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const prefix = kind === "CLIENT" ? "client" : "agent";
  // L'identifiant technique et non le nom : le fichier circule par email et se
  // retrouve dans des dossiers partagés, son NOM n'a pas à porter une identité.
  return `donnees-personnelles-${prefix}-${id.slice(-6)}-${stamp}.csv`;
}
