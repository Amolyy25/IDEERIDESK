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
  adminOnly?: boolean;
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
        label: "Général",
        description:
          "Identité de l'entreprise, fuseau horaire et messages affichés aux clients.",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Tickets",
    items: [
      {
        href: "/settings/statuses",
        label: "Statuts",
        title: "Statuts de ticket",
        description: "Les états par lesquels passe un ticket, du dépôt à la clôture.",
      },
      {
        href: "/settings/priorities",
        label: "Priorités",
        description: "Les niveaux d'urgence que les agents peuvent attribuer.",
      },
      {
        href: "/settings/categories",
        label: "Produits",
        title: "Produits concernés",
        description: "Les logiciels et services auxquels rattacher un ticket.",
      },
      {
        href: "/settings/custom-fields",
        label: "Champs personnalisés",
        description:
          "Les informations demandées en plus sur tous les formulaires publics.",
      },
    ],
  },
  {
    label: "Canaux publics",
    items: [
      {
        href: "/settings/portal",
        label: "Portail",
        title: "Portail public",
        description:
          "Apparence et contenu des pages publiques : accueil, FAQ et création de ticket.",
        adminOnly: true,
      },
      {
        href: "/settings/sources",
        label: "Sources",
        title: "Sources de tickets",
        description: "Les points d'entrée de tickets et le formulaire propre à chacun.",
        adminOnly: true,
      },
    ],
  },
  {
    label: "E-mail",
    items: [
      {
        href: "/settings/email",
        label: "Boîte de support",
        description:
          "Compte Gmail relié au support, réception des réponses et création de tickets depuis les emails entrants.",
      },
      {
        href: "/settings/email-layout",
        label: "Habillage des emails",
        description:
          "Le HTML et le CSS de l'enveloppe commune à tous les emails sortants : en-tête, carte, pied de page.",
        adminOnly: true,
      },
      {
        href: "/settings/signatures",
        label: "Signatures",
        title: "Signatures des agents",
        description:
          "Le bloc ajouté en bas des réponses envoyées au client, avec le nom de l'agent qui répond. Une signature vaut pour toute l'équipe ou pour quelques agents seulement.",
        adminOnly: true,
      },
      {
        href: "/settings/acknowledgement",
        label: "Accusé de réception",
        description:
          "L'email envoyé au client dès qu'un ticket est ouvert à son nom, depuis un formulaire public comme depuis un email entrant.",
        adminOnly: true,
      },
      {
        href: "/settings/closure",
        label: "Message de clôture",
        description: "L'email envoyé au client quand son ticket est clos.",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Automatisation",
    items: [
      {
        href: "/settings/ai",
        label: "Assistant IA",
        description:
          "Fournisseur, modèle et clé d'API utilisés pour les suggestions de réponse.",
        adminOnly: true,
      },
      {
        href: "/settings/automations",
        label: "Règles automatiques",
        description:
          "Actions déclenchées seules sur les tickets restés trop longtemps sans activité.",
        adminOnly: true,
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
