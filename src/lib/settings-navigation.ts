import { can, type PermissionKey } from "@/lib/permissions";

/**
 * Plan unique de la page Paramètres : l'ordre des groupes, le libellé de
 * navigation et l'intitulé complet de chaque section.
 *
 * Un seul endroit à modifier pour ajouter un réglage : la barre latérale et
 * l'en-tête de la page se déduisent d'ici, ils ne peuvent pas diverger.
 */

export type SettingsItem = {
  href: string;
  /** Libellé court, dans la barre latérale. */
  label: string;
  /** Titre de la section, si plus explicite que le libellé de navigation. */
  title?: string;
  description: string;
  /**
   * Permission qui ouvre la section (voir src/lib/permissions.ts). Ce n'est pas
   * ce qui protège la donnée — les Server Actions ont leurs propres gardes —
   * mais ce qui décide de l'affichage de l'entrée et de la section.
   */
  permission: PermissionKey;
};

export type SettingsGroup = {
  label: string;
  items: SettingsItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Espace de travail",
    items: [
      {
        href: "/settings/general",
        permission: "settings.workspace",
        label: "Général",
        description:
          "Identité de l'entreprise, fuseau horaire et messages affichés aux clients.",
      },
    ],
  },
  {
    label: "Tickets",
    items: [
      {
        href: "/settings/statuses",
        permission: "settings.tickets",
        label: "Statuts",
        title: "Statuts de ticket",
        description: "Les états par lesquels passe un ticket, du dépôt à la clôture.",
      },
      {
        href: "/settings/priorities",
        permission: "settings.tickets",
        label: "Priorités",
        description: "Les niveaux d'urgence que les agents peuvent attribuer.",
      },
      {
        href: "/settings/sla",
        permission: "settings.tickets",
        label: "SLA",
        title: "Engagements de délai (SLA)",
        description:
          "Le temps qu'on se donne pour répondre à un client et pour clore son dossier, selon la priorité. Une horloge par ticket, visible dans la file — pas un rapport de fin de mois.",
      },
      {
        href: "/settings/categories",
        permission: "settings.tickets",
        label: "Produits",
        title: "Produits concernés",
        description: "Les logiciels et services auxquels rattacher un ticket.",
      },
      {
        href: "/settings/custom-fields",
        permission: "settings.tickets",
        label: "Champs personnalisés",
        description:
          "Les informations demandées en plus sur tous les formulaires publics.",
      },
      {
        href: "/settings/canned-responses",
        permission: "settings.tickets",
        label: "Réponses prédéfinies",
        description:
          "Les réponses type proposées d'un clic dans la zone de rédaction d'un ticket. Chacune peut être limitée à certains produits, sources, priorités ou statuts : seules celles qui concernent le ticket ouvert sont proposées.",
      },
    ],
  },
  {
    label: "Canaux publics",
    items: [
      {
        href: "/settings/portal",
        permission: "settings.channels",
        label: "Portail",
        title: "Portail public",
        description:
          "Apparence et contenu des pages publiques : accueil, FAQ et création de ticket.",
      },
      {
        href: "/settings/sources",
        permission: "settings.channels",
        label: "Sources",
        title: "Sources de tickets",
        description: "Les points d'entrée de tickets et le formulaire propre à chacun.",
      },
    ],
  },
  {
    label: "E-mail",
    items: [
      {
        href: "/settings/email",
        permission: "settings.email",
        label: "Boîte de support",
        description:
          "Compte Gmail relié au support, réception des réponses et création de tickets depuis les emails entrants.",
      },
      {
        href: "/settings/email-layout",
        permission: "settings.email",
        label: "Habillage des emails",
        description:
          "Le HTML et le CSS de l'enveloppe commune à tous les emails sortants : en-tête, carte, pied de page.",
      },
      {
        href: "/settings/signatures",
        permission: "settings.email",
        label: "Signatures",
        title: "Signatures des agents",
        description:
          "Le bloc ajouté en bas des réponses envoyées au client, avec le nom de l'agent qui répond. Une signature vaut pour toute l'équipe ou pour quelques agents seulement.",
      },
      {
        href: "/settings/acknowledgement",
        permission: "settings.email",
        label: "Accusé de réception",
        description:
          "L'email envoyé au client dès qu'un ticket est ouvert à son nom, depuis un formulaire public comme depuis un email entrant.",
      },
      {
        href: "/settings/closure",
        permission: "settings.email",
        label: "Message de clôture",
        description: "L'email envoyé au client quand son ticket est clos.",
      },
    ],
  },
  {
    label: "Automatisation",
    items: [
      {
        href: "/settings/ai",
        permission: "settings.workspace",
        label: "Assistant IA",
        description:
          "Fournisseur, modèle et clé d'API utilisés pour les suggestions de réponse.",
      },
      {
        href: "/settings/automations",
        permission: "settings.workspace",
        label: "Règles automatiques",
        description:
          "Actions déclenchées seules sur les tickets d'un statut et d'une priorité donnés restés trop longtemps sans activité.",
      },
    ],
  },
];

const ITEMS_BY_HREF = new Map(
  SETTINGS_GROUPS.flatMap((group) => group.items).map((item) => [item.href, item]),
);

/** Section correspondant à une route de réglages. Lève si la route est absente du plan. */
export function settingsItem(href: string): SettingsItem {
  const item = ITEMS_BY_HREF.get(href);
  if (!item) {
    throw new Error(`Route de réglages absente du plan de navigation : ${href}`);
  }
  return item;
}

export function settingsTitle(item: SettingsItem) {
  return item.title ?? item.label;
}

/** Groupes réduits à ce que l'agent peut ouvrir ; les groupes vidés disparaissent. */
export function visibleSettingsGroups(
  permissions: readonly PermissionKey[] | undefined,
): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(permissions, item.permission)),
  })).filter((group) => group.items.length > 0);
}
