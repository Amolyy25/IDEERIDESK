import type { AgentRole } from "@/generated/prisma/client";

/**
 * Registre des permissions d'agent.
 *
 * Même principe que `AUDIT_ACTIONS` ou `FILTER_DIMENSIONS` : un seul endroit du
 * code sait ce qu'une permission autorise, comment elle se nomme et où elle se
 * range. Les gardes des Server Actions, la barre latérale, le plan des réglages
 * et le panneau de l'écran Équipe s'en déduisent tous — aucun d'eux ne porte de
 * liste en dur, ils ne peuvent donc pas diverger.
 *
 * Ajouter une permission = ajouter sa clé à `PERMISSION_KEYS` PUIS son entrée
 * dans `PERMISSIONS` (la table est exhaustive par construction : un oubli casse
 * la compilation), et enfin poser la garde correspondante côté serveur.
 *
 * Le rôle ADMIN n'est délibérément PAS une permission de cette liste : c'est le
 * raccourci « toutes les permissions, y compris celles qui n'existent pas
 * encore ». Un administrateur ne se coche donc rien, et une permission ajoutée
 * plus tard ne lui échappe pas. Ce que le rôle garde en propre — et qu'aucune
 * permission ne donne — c'est le droit de nommer un autre administrateur (voir
 * `updateAgentPermissions`) : sans cette exception, `team.manage` permettrait à
 * son porteur de se promouvoir lui-même.
 *
 * Aucune directive `"use server"` ici : le registre est lu par les gardes
 * serveur comme par les composants client.
 */

// ---------------------------------------------------------------------------
// Clés
// ---------------------------------------------------------------------------

/**
 * Ordre de déclaration = ordre d'affichage dans le panneau des permissions.
 * Les clés sont persistées en base (`Agent.permissions`) : en renommer une
 * impose une migration de données, pas seulement un remplacement dans le code.
 */
export const PERMISSION_KEYS = [
  // Tickets
  "tickets.view",
  "tickets.respond",
  "tickets.merge",
  "tickets.delete",
  "approvals.handle",
  // Répertoire
  "clients.view",
  "clients.manage",
  "clients.delete",
  "team.view",
  "team.manage",
  // Contenu
  "kb.view",
  "kb.manage",
  // Supervision
  "audit.view",
  // Paramètres
  "settings.tickets",
  "settings.email",
  "settings.channels",
  "settings.workspace",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

// ---------------------------------------------------------------------------
// Groupes
// ---------------------------------------------------------------------------

export const PERMISSION_GROUPS = [
  {
    key: "tickets",
    label: "Tickets",
    description: "Le travail quotidien sur les demandes des clients.",
  },
  {
    key: "directory",
    label: "Répertoire",
    description: "Les contacts clients et les comptes de l'équipe.",
  },
  {
    key: "content",
    label: "Contenu",
    description: "La base de connaissances lue par les agents et par les clients.",
  },
  {
    key: "supervision",
    label: "Supervision",
    description: "Le relevé de l'activité de l'équipe.",
  },
  {
    key: "settings",
    label: "Paramètres",
    description:
      "La configuration de l'espace de travail. Ces réglages s'appliquent à tout le monde : ce qu'un agent y change, toute l'équipe le subit.",
  },
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUPS)[number]["key"];

// ---------------------------------------------------------------------------
// Table des permissions
// ---------------------------------------------------------------------------

type PermissionMeta = {
  /** Libellé du commutateur, à l'infinitif : ce que la permission autorise. */
  label: string;
  description: string;
  group: PermissionGroupKey;
  /** Message renvoyé par la garde serveur quand la permission manque. */
  denial: string;
  /**
   * Accordée d'office à un compte créé à sa première connexion. Reproduit ce
   * qu'un nouvel agent obtenait avant ce registre : lire et traiter les
   * tickets, tenir le répertoire clients, écrire dans la base de connaissances.
   * Rien qui touche à la configuration, à la suppression ou aux comptes.
   */
  standard?: boolean;
  /**
   * Permission dont l'octroi engage au-delà du travail courant : suppression
   * irréversible, relevé nominatif d'activité, ou droit sur les comptes des
   * collègues. Signalée comme telle dans le panneau — accorder n'est pas
   * interdit, c'est un choix qui doit se voir.
   */
  sensitive?: boolean;
  /**
   * Permission sans laquelle celle-ci n'a aucun sens (on ne répond pas à un
   * ticket qu'on ne peut pas ouvrir). Accorder l'une accorde l'autre, retirer
   * le prérequis retire ce qui en dépend — garanti côté serveur par
   * `normalizePermissions`, pas seulement dans l'interface.
   */
  requires?: PermissionKey;
};

export const PERMISSIONS: Record<PermissionKey, PermissionMeta> = {
  "tickets.view": {
    label: "Accéder aux tickets",
    description: "Ouvrir la liste des tickets et lire le fil d'une demande.",
    group: "tickets",
    denial: "Vous n'avez pas accès aux tickets.",
    standard: true,
  },
  "tickets.respond": {
    label: "Répondre et modifier",
    description:
      "Écrire au client, ajouter une note interne, changer le statut, la priorité, l'assignation.",
    group: "tickets",
    denial: "Votre compte est en lecture seule.",
    standard: true,
    requires: "tickets.view",
  },
  "tickets.merge": {
    label: "Fusionner les doublons",
    description: "Rapprocher deux tickets qui traitent de la même demande, et défaire la fusion.",
    group: "tickets",
    denial: "Vous n'avez pas la permission de fusionner des tickets.",
    standard: true,
    requires: "tickets.respond",
  },
  "tickets.delete": {
    label: "Supprimer un ticket",
    description:
      "Effacer définitivement un ticket et son fil. La suppression reste tracée au journal, mais le dossier, lui, ne revient pas.",
    group: "tickets",
    denial: "Vous n'avez pas la permission de supprimer un ticket.",
    sensitive: true,
    requires: "tickets.view",
  },
  "approvals.handle": {
    label: "Valider les réponses en attente",
    description:
      "Traiter la file des réponses retenues : les laisser partir au client ou les refuser.",
    group: "tickets",
    denial: "Vous n'avez pas la permission de valider les réponses.",
    requires: "tickets.view",
  },

  "clients.view": {
    label: "Accéder aux clients",
    description: "Consulter la fiche des contacts à l'origine des tickets.",
    group: "directory",
    denial: "Vous n'avez pas accès au répertoire client.",
    standard: true,
  },
  "clients.manage": {
    label: "Créer et modifier des clients",
    description: "Ajouter un contact au répertoire et corriger ses coordonnées.",
    group: "directory",
    denial: "Vous n'avez pas la permission de modifier une fiche client.",
    standard: true,
    requires: "clients.view",
  },
  "clients.delete": {
    label: "Supprimer un client",
    description: "Retirer définitivement un contact du répertoire.",
    group: "directory",
    denial: "Vous n'avez pas la permission de supprimer une fiche client.",
    sensitive: true,
    requires: "clients.manage",
  },
  "team.view": {
    label: "Accéder à l'équipe",
    description: "Voir les membres, leurs groupes et les permissions de chacun, sans y toucher.",
    group: "directory",
    denial: "Vous n'avez pas accès à la page Équipe.",
    standard: true,
  },
  "team.manage": {
    label: "Gérer les comptes et les permissions",
    description:
      "Trancher les demandes d'accès, désactiver un compte, modifier les permissions et les groupes. Un agent ne peut jamais accorder une permission qu'il n'a pas lui-même, ni nommer d'administrateur.",
    group: "directory",
    denial: "Vous n'avez pas la permission de gérer les comptes de l'équipe.",
    sensitive: true,
    requires: "team.view",
  },

  "kb.view": {
    label: "Accéder à la base de connaissances",
    description: "Lire les articles internes et publiés.",
    group: "content",
    denial: "Vous n'avez pas accès à la base de connaissances.",
    standard: true,
  },
  "kb.manage": {
    label: "Rédiger et publier",
    description:
      "Créer, modifier, supprimer et publier des articles, gérer les catégories et les modèles. Un article publié est visible du public.",
    group: "content",
    denial: "Vous n'avez pas la permission de modifier la base de connaissances.",
    standard: true,
    requires: "kb.view",
  },

  "audit.view": {
    label: "Consulter le journal d'audit",
    description:
      "Voir qui a ouvert quel dossier, répondu à qui et modifié quoi. C'est un relevé d'activité nominatif de chaque collègue autant qu'un outil de conformité.",
    group: "supervision",
    denial: "Vous n'avez pas accès au journal d'audit.",
    sensitive: true,
  },

  "settings.tickets": {
    label: "Configurer les tickets",
    description:
      "Statuts, priorités, produits concernés, champs personnalisés et réponses prédéfinies. Supprimer un statut ou un produit affecte tous les tickets qui s'y rattachent.",
    group: "settings",
    denial: "Vous n'avez pas la permission de configurer les tickets.",
  },
  "settings.email": {
    label: "Configurer les emails",
    description:
      "Boîte de support Gmail, habillage des emails sortants, signatures, accusé de réception et message de clôture.",
    group: "settings",
    denial: "Vous n'avez pas la permission de configurer les emails.",
  },
  "settings.channels": {
    label: "Configurer les canaux publics",
    description:
      "Le portail public et les formulaires de chaque source. Ce qui est modifié ici est immédiatement visible des clients.",
    group: "settings",
    denial: "Vous n'avez pas la permission de configurer les canaux publics.",
  },
  "settings.workspace": {
    label: "Configurer l'espace de travail",
    description:
      "Réglages généraux, assistant IA (dont la clé d'API) et règles automatiques.",
    group: "settings",
    denial: "Vous n'avez pas la permission de configurer l'espace de travail.",
    sensitive: true,
  },
};

// ---------------------------------------------------------------------------
// Lecture du registre
// ---------------------------------------------------------------------------

/** Permissions accordées d'office à un compte créé à sa première connexion. */
export const DEFAULT_AGENT_PERMISSIONS: PermissionKey[] = PERMISSION_KEYS.filter(
  (key) => PERMISSIONS[key].standard,
);

export function isPermissionKey(value: string): value is PermissionKey {
  return value in PERMISSIONS;
}

export function permissionLabel(key: PermissionKey) {
  return PERMISSIONS[key].label;
}

/** Clés d'un groupe, dans l'ordre du registre. */
export function permissionsInGroup(group: PermissionGroupKey): PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => PERMISSIONS[key].group === group);
}

/** Permissions qui disparaissent avec `key`, en cascade (`requires`). */
export function permissionsDependingOn(key: PermissionKey): PermissionKey[] {
  const dependents = PERMISSION_KEYS.filter((candidate) => PERMISSIONS[candidate].requires === key);
  return dependents.flatMap((dependent) => [dependent, ...permissionsDependingOn(dependent)]);
}

/**
 * Liste propre : clés inconnues écartées, doublons supprimés, prérequis
 * ajoutés, ordre du registre rétabli.
 *
 * Appliquée à l'enregistrement ET à la lecture. À l'enregistrement parce que
 * l'entrée vient d'un appel HTTP et peut contenir n'importe quoi ; à la lecture
 * parce qu'une clé retirée du registre peut rester en base sur d'anciennes
 * lignes, et qu'elle ne doit plus rien autoriser.
 */
export function normalizePermissions(values: readonly string[]): PermissionKey[] {
  const granted = new Set<PermissionKey>();

  const add = (key: PermissionKey) => {
    if (granted.has(key)) return;
    granted.add(key);
    const prerequisite = PERMISSIONS[key].requires;
    if (prerequisite) add(prerequisite);
  };

  for (const value of values) {
    if (isPermissionKey(value)) add(value);
  }

  return PERMISSION_KEYS.filter((key) => granted.has(key));
}

/**
 * Ce qu'un agent peut réellement faire.
 *
 * Un administrateur a tout, sans que rien ne soit stocké pour lui : c'est ce
 * qui garantit qu'une permission ajoutée au registre demain lui est acquise
 * sans migration.
 */
export function effectivePermissions(agent: {
  role: AgentRole;
  permissions: readonly string[];
}): PermissionKey[] {
  if (agent.role === "ADMIN") return [...PERMISSION_KEYS];
  return normalizePermissions(agent.permissions);
}

/** Test d'une permission sur une liste déjà résolue (session, props client). */
export function can(
  permissions: readonly PermissionKey[] | undefined,
  key: PermissionKey,
): boolean {
  return permissions?.includes(key) ?? false;
}

export function canAny(
  permissions: readonly PermissionKey[] | undefined,
  keys: readonly PermissionKey[],
): boolean {
  return keys.some((key) => can(permissions, key));
}
