import { can, canAny, permissionsInGroup, type PermissionKey } from "@/lib/permissions";
import { matchesQuery } from "@/lib/search-match";

/**
 * Plan de la navigation principale de l'espace agent.
 *
 * Pendant de `SETTINGS_GROUPS` pour les réglages, et même raison d'être : la
 * barre latérale, les redirections de page et le calcul de la page d'atterrissage
 * lisent tous ce plan. Une entrée ajoutée ici apparaît partout, avec la même
 * condition d'accès — il n'y a pas de second endroit à penser à mettre à jour.
 *
 * Chaque entrée déclare la permission qui l'ouvre. Ce n'est PAS ce qui protège
 * la donnée : les Server Actions ont leurs propres gardes, seule frontière
 * réelle. Ce plan décide de ce qui s'affiche et d'où l'on est renvoyé.
 */

export type NavItem = {
  label: string;
  href: string;
  permission: PermissionKey;
  /** Ce qu'on tape à la place du libellé : anglais, jargon métier, abréviation. */
  keywords?: string[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Support",
    items: [
      {
        label: "Tickets",
        href: "/tickets",
        permission: "tickets.view",
        keywords: ["file", "demandes", "support"],
      },
      {
        label: "Validations",
        href: "/approvals",
        permission: "approvals.handle",
        keywords: ["approvals", "relecture", "moderation"],
      },
    ],
  },
  {
    label: "Répertoire",
    items: [
      {
        label: "Clients",
        href: "/clients",
        permission: "clients.view",
        keywords: ["repertoire", "agences", "contacts", "mandants"],
      },
      {
        label: "Équipe",
        href: "/agents",
        permission: "team.view",
        keywords: ["agents", "team", "collegues", "acces"],
      },
    ],
  },
  {
    label: "Contenu",
    items: [
      {
        label: "Base de connaissances",
        href: "/knowledge-base",
        permission: "kb.view",
        keywords: ["kb", "faq", "articles", "aide", "documentation"],
      },
    ],
  },
  {
    // Le journal dit qui a ouvert quel dossier et quand, c'est-à-dire aussi un
    // relevé d'activité nominatif de chaque agent. Ouvert à toute l'équipe,
    // l'outil de conformité deviendrait un outil de surveillance entre collègues
    // — d'où une permission distincte, marquée sensible dans le registre.
    label: "Supervision",
    items: [
      // Les statistiques d'abord : on vient y lire l'état du support (combien
      // arrive, combien attend, qui tient les délais), là où le journal répond à
      // une question précise sur un dossier ou une personne.
      {
        label: "Statistiques",
        href: "/stats",
        permission: "stats.view",
        keywords: ["stats", "chiffres", "rapports", "dashboard"],
      },
      {
        label: "Journal d'audit",
        href: "/audit",
        permission: "audit.view",
        keywords: ["audit", "logs", "historique", "tracabilite"],
      },
      // Volontairement une entrée à part et non un onglet du journal : on n'y
      // vient pas pour lire mais pour répondre à une demande nominative
      // (« exportez-moi mes données », « effacez-moi »), et les deux gestes
      // d'effacement sont irréversibles. Les mélanger à un écran de consultation
      // ferait cliquer par ricochet.
      {
        label: "Données personnelles",
        href: "/privacy",
        permission: "privacy.manage",
        keywords: ["rgpd", "gdpr", "privacy", "confidentialite", "effacement"],
      },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** Les réglages n'ont pas d'entrée dans le plan ci-dessus : ils vivent dans leur propre menu. */
const SETTINGS_PERMISSIONS = permissionsInGroup("settings");

/** Groupes réduits à ce que l'agent peut ouvrir ; les groupes vidés disparaissent. */
export function visibleNavGroups(permissions: readonly PermissionKey[] | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(permissions, item.permission)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Page sur laquelle envoyer un agent qui n'a rien demandé de précis : après
 * connexion, ou quand il atterrit sur une page qui n'est pas pour lui.
 *
 * `/tickets` n'est plus une réponse universelle depuis que l'accès aux tickets
 * se retire : un agent qui ne les voit pas y serait renvoyé en boucle. On prend
 * donc la première entrée du plan qu'il peut réellement ouvrir, et
 * `/aucun-acces` quand il n'y en a aucune — écran qui, lui, n'exige rien.
 */
export function defaultLandingPath(permissions: readonly PermissionKey[] | undefined): string {
  const reachable = NAV_ITEMS.find((item) => can(permissions, item.permission));
  if (reachable) return reachable.href;

  // Un agent sans aucune page mais habilité sur les réglages reste utile : il a
  // encore une raison de se connecter.
  if (canAny(permissions, SETTINGS_PERMISSIONS)) return "/settings";

  return "/aucun-acces";
}

// Le chemin fait partie des champs comparés : « setting » trouve « Paramètres »
// par son `/settings`, sans avoir à lister tout l'anglais en mots-clés.
export function matchesNavQuery(
  item: { label: string; href: string; keywords?: string[] },
  query: string
) {
  return matchesQuery([item.label, item.href, ...(item.keywords ?? [])], query);
}
