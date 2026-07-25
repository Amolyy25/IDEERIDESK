/**
 * Contrat unique du portail public : types, valeurs par défaut, listes de choix
 * (polices, icônes, dispositions) et génération du CSS de thème.
 *
 * Importé côté serveur (layout, pages, server actions) ET côté client
 * (formulaire de réglages, aperçu) — ne rien mettre ici qui touche Prisma ou
 * `next/font`.
 */

import { z } from "zod";
import {
  ArrowRight,
  BadgeQuestionMark,
  Book,
  BookOpen,
  Bug,
  Building2,
  CircleHelp,
  Compass,
  FileText,
  Headset,
  Home,
  Info,
  Key,
  LifeBuoy,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Ticket,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icônes proposées à l'admin
// ---------------------------------------------------------------------------

// Liste blanche : le nom d'icône est stocké en base et rendu côté portail. On
// ne résout jamais un nom arbitraire depuis `lucide-react` (bundle entier +
// crash si le nom n'existe plus après une mise à jour de la lib).
export const PORTAL_ICONS: Record<string, LucideIcon> = {
  ArrowRight,
  BadgeQuestionMark,
  Book,
  BookOpen,
  Bug,
  Building2,
  CircleHelp,
  Compass,
  FileText,
  Headset,
  Home,
  Info,
  Key,
  LifeBuoy,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Ticket,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
};

export const PORTAL_ICON_NAMES = Object.keys(PORTAL_ICONS);

// ---------------------------------------------------------------------------
// Polices
// ---------------------------------------------------------------------------

// Les clés doivent correspondre à `PORTAL_FONTS` dans src/lib/portal-fonts.ts,
// qui les charge réellement via next/font.
export const PORTAL_SANS_FONTS = [
  { key: "inter", label: "Inter (par défaut)" },
  { key: "geist", label: "Geist" },
  { key: "manrope", label: "Manrope" },
  { key: "dm-sans", label: "DM Sans" },
  { key: "plus-jakarta", label: "Plus Jakarta Sans" },
  { key: "figtree", label: "Figtree" },
] as const;

export const PORTAL_DISPLAY_FONTS = [
  { key: "fraunces", label: "Fraunces (par défaut)" },
  { key: "playfair", label: "Playfair Display" },
  { key: "instrument-serif", label: "Instrument Serif" },
  { key: "space-grotesk", label: "Space Grotesk" },
  { key: "outfit", label: "Outfit" },
  ...PORTAL_SANS_FONTS.map((f) => ({ key: f.key, label: `${f.label} (sans)` })),
] as const;

export const PORTAL_FONT_KEYS = [
  ...new Set([
    ...PORTAL_SANS_FONTS.map((f) => f.key),
    ...PORTAL_DISPLAY_FONTS.map((f) => f.key),
  ]),
];

/**
 * Nom de la variable CSS déclarée par next/font pour une police du portail.
 * Le type littéral est exigé par l'option `variable` de next/font.
 */
export function portalFontVarName(key: string): `--${string}` {
  return `--font-portal-${key}`;
}

// ---------------------------------------------------------------------------
// Dispositions
// ---------------------------------------------------------------------------

export const PORTAL_NAV_VARIANTS = [
  { key: "LOGO_LEFT", label: "Logo à gauche, liens à droite" },
  { key: "LINKS_CENTER", label: "Logo à gauche, liens centrés, bouton à droite" },
  { key: "CENTERED", label: "Tout centré, liens sur une seconde ligne" },
  { key: "MINIMAL", label: "Minimale : logo + bouton d'action" },
] as const;

export const PORTAL_COLOR_MODES = [
  { key: "LIGHT", label: "Clair" },
  { key: "DARK", label: "Sombre" },
] as const;

export const PORTAL_ALIGNS = [
  { key: "CENTER", label: "Centré" },
  { key: "LEFT", label: "Aligné à gauche" },
] as const;

export const PORTAL_RADIUS_OPTIONS = [
  { value: 0, label: "Angles droits" },
  { value: 0.25, label: "Très légers" },
  { value: 0.5, label: "Arrondis (par défaut)" },
  { value: 0.75, label: "Généreux" },
  { value: 1, label: "Très arrondis" },
  { value: 1.5, label: "Pilule" },
] as const;

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexColor = z.string().trim().regex(HEX, "Couleur invalide (format attendu : #1a2b3c)");
/** Couleur facultative : chaîne vide côté formulaire = « garder la valeur du thème ». */
const optionalHexColor = z
  .union([hexColor, z.literal(""), z.null()])
  .transform((v) => (v ? v : null))
  .nullable();

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((v) => (v ? v : null))
    .nullable();

export const portalLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  href: z
    .string()
    .trim()
    .min(1)
    .max(500)
    // Liens internes, ancres, mailto/tel et http(s) — pas de `javascript:`.
    .refine(
      (v) => /^(\/|#|https?:\/\/|mailto:|tel:)/.test(v),
      "Lien invalide : commencez par /, #, http(s)://, mailto: ou tel:",
    ),
  newTab: z.boolean().default(false),
});

export type PortalLink = z.output<typeof portalLinkSchema>;

export const portalSettingsSchema = z.object({
  // Identité
  siteName: z.string().trim().min(1).max(60),
  tagline: optionalText(40),
  showTagline: z.boolean(),
  showLogo: z.boolean(),
  showSiteName: z.boolean(),
  logoAssetId: z.string().trim().max(50).nullable(),
  logoHeight: z.number().int().min(16).max(64),
  faviconAssetId: z.string().trim().max(50).nullable(),
  metaTitle: optionalText(120),
  metaDescription: optionalText(300),

  // Apparence
  colorMode: z.enum(["LIGHT", "DARK"]),
  primaryColor: hexColor,
  primaryForegroundColor: hexColor,
  backgroundColor: optionalHexColor,
  foregroundColor: optionalHexColor,
  cardColor: optionalHexColor,
  borderColor: optionalHexColor,
  mutedColor: optionalHexColor,
  mutedForegroundColor: optionalHexColor,
  radius: z.number().min(0).max(2),
  fontSans: z.enum(PORTAL_SANS_FONTS.map((f) => f.key) as [string, ...string[]]),
  fontDisplay: z.enum(PORTAL_DISPLAY_FONTS.map((f) => f.key) as [string, ...string[]]),

  // Navigation
  navVariant: z.enum(["LOGO_LEFT", "LINKS_CENTER", "CENTERED", "MINIMAL"]),
  navSticky: z.boolean(),
  navBlur: z.boolean(),
  navBordered: z.boolean(),
  navShowFaq: z.boolean(),
  navShowLogin: z.boolean(),
  navCtaEnabled: z.boolean(),
  navCtaLabel: z.string().trim().min(1).max(40),
  navLinks: z.array(portalLinkSchema).max(8),

  // Hero
  heroEnabled: z.boolean(),
  heroEyebrow: optionalText(80),
  heroTitle: optionalText(120),
  introMessage: optionalText(1000),
  heroAlign: z.enum(["LEFT", "CENTER"]),
  heroGlow: z.boolean(),

  // Cartes
  cardsEnabled: z.boolean(),
  faqCardTitle: z.string().trim().min(1).max(60),
  faqCardText: z.string().trim().max(300),
  faqCardIcon: z.enum(PORTAL_ICON_NAMES as [string, ...string[]]),
  ticketCardTitle: z.string().trim().min(1).max(60),
  ticketCardText: z.string().trim().max(300),
  ticketCardIcon: z.enum(PORTAL_ICON_NAMES as [string, ...string[]]),

  // FAQ
  faqEnabled: z.boolean(),
  faqEyebrow: optionalText(80),
  faqTitle: optionalText(120),
  faqSearchEnabled: z.boolean(),

  // Pied de page
  footerEnabled: z.boolean(),
  footerText: optionalText(200),
  footerIcon: z.enum(PORTAL_ICON_NAMES as [string, ...string[]]),
  footerLinks: z.array(portalLinkSchema).max(8),
});

/** Configuration résolue du portail : aucun champ manquant, prête à rendre. */
export type PortalConfig = z.output<typeof portalSettingsSchema>;
/** Ce que le formulaire envoie (les liens y ont `newTab` optionnel). */
export type PortalConfigInput = z.input<typeof portalSettingsSchema>;

// Doit rester aligné avec les @default du modèle PortalSettings (schema.prisma) :
// c'est ce qui s'applique quand la table est encore vide.
export const PORTAL_DEFAULTS: PortalConfig = {
  siteName: "Ideeri",
  tagline: "Support",
  showTagline: true,
  showLogo: true,
  showSiteName: false,
  logoAssetId: null,
  logoHeight: 24,
  faviconAssetId: null,
  metaTitle: null,
  metaDescription: null,

  colorMode: "LIGHT",
  primaryColor: "#ecb300",
  primaryForegroundColor: "#0a0a0a",
  backgroundColor: null,
  foregroundColor: null,
  cardColor: null,
  borderColor: null,
  mutedColor: null,
  mutedForegroundColor: null,
  radius: 0.5,
  fontSans: "inter",
  fontDisplay: "fraunces",

  navVariant: "LOGO_LEFT",
  navSticky: true,
  navBlur: true,
  navBordered: true,
  navShowFaq: true,
  navShowLogin: true,
  navCtaEnabled: true,
  navCtaLabel: "Créer un ticket",
  navLinks: [],

  heroEnabled: true,
  heroEyebrow: "Centre d'aide Ideeri",
  heroTitle: "Comment pouvons-nous vous aider ?",
  introMessage: null,
  heroAlign: "CENTER",
  heroGlow: true,

  cardsEnabled: true,
  faqCardTitle: "Consulter la FAQ",
  faqCardText:
    "Les réponses aux questions les plus fréquentes sur nos logiciels, classées par produit.",
  faqCardIcon: "BookOpen",
  ticketCardTitle: "Créer un ticket",
  ticketCardText:
    "Une question précise ou un problème ? Décrivez votre demande, nous vous répondons par email.",
  ticketCardIcon: "MessagesSquare",

  faqEnabled: true,
  faqEyebrow: "Foire aux questions",
  faqTitle: "Trouvez votre réponse",
  faqSearchEnabled: true,

  footerEnabled: true,
  footerText: "Support Ideeri",
  footerIcon: "LifeBuoy",
  footerLinks: [],
};

/** Texte de repli du sous-titre du hero quand aucun message d'accueil n'est saisi. */
export const PORTAL_INTRO_FALLBACK =
  "Trouvez une réponse immédiate dans notre FAQ, ou ouvrez un ticket : notre équipe support revient vers vous par email.";

// ---------------------------------------------------------------------------
// Thème CSS
// ---------------------------------------------------------------------------

// Recopie du bloc `.dark { … }` de globals.css. Le portail applique son thème
// via des variables posées sur `html` : en mode sombre il faut donc redonner
// explicitement la palette sombre, sinon `html` garderait celle de `:root`
// (clair) et le fond de page ne suivrait pas.
const DARK_BASE: Record<string, string> = {
  "--background": "oklch(0.145 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.205 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--popover": "oklch(0.205 0 0)",
  "--popover-foreground": "oklch(0.985 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--accent": "oklch(0.269 0 0)",
  "--accent-foreground": "oklch(0.985 0 0)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
};

/**
 * Variables CSS dérivées de la configuration. Les noms sont ceux de
 * globals.css (`--primary`, `--background`, …) : `@theme inline` les lit, donc
 * toutes les classes Tailwind du portail suivent automatiquement.
 */
export function portalCssVariables(config: PortalConfig): Record<string, string> {
  const hex = (value: string | null) => (value && HEX.test(value) ? value : null);
  const vars: Record<string, string> = {
    ...(config.colorMode === "DARK" ? DARK_BASE : {}),
    "--primary": hex(config.primaryColor) ?? PORTAL_DEFAULTS.primaryColor,
    "--primary-foreground":
      hex(config.primaryForegroundColor) ?? PORTAL_DEFAULTS.primaryForegroundColor,
    "--ring": hex(config.primaryColor) ?? PORTAL_DEFAULTS.primaryColor,
    "--sidebar-primary": hex(config.primaryColor) ?? PORTAL_DEFAULTS.primaryColor,
    "--radius": `${Math.min(Math.max(config.radius, 0), 2)}rem`,
    "--font-sans": `var(${portalFontVarName(config.fontSans)})`,
    "--font-display": `var(${portalFontVarName(config.fontDisplay)})`,
  };

  const background = hex(config.backgroundColor);
  if (background) vars["--background"] = background;

  const foreground = hex(config.foregroundColor);
  if (foreground) {
    vars["--foreground"] = foreground;
    vars["--card-foreground"] = foreground;
    vars["--popover-foreground"] = foreground;
    vars["--secondary-foreground"] = foreground;
    vars["--accent-foreground"] = foreground;
  }

  const card = hex(config.cardColor);
  if (card) {
    vars["--card"] = card;
    vars["--popover"] = card;
  }

  const border = hex(config.borderColor);
  if (border) {
    vars["--border"] = border;
    vars["--input"] = border;
  }

  const muted = hex(config.mutedColor);
  if (muted) {
    vars["--muted"] = muted;
    vars["--secondary"] = muted;
    vars["--accent"] = muted;
  }

  const mutedForeground = hex(config.mutedForegroundColor);
  if (mutedForeground) vars["--muted-foreground"] = mutedForeground;

  return vars;
}

/**
 * Feuille de style du portail. Deux sélecteurs, tous deux choisis pour leur
 * spécificité :
 * - `html:root` (0-1-1) pour passer devant le `:root { … }` de globals.css, et
 *   colorer le fond de la page jusqu'au rebond de scroll ;
 * - `.portal-theme.portal-theme` (0-2-0) pour passer devant le `.dark { … }` de
 *   globals.css, appliqué au même élément en mode sombre.
 */
export function portalThemeCss(config: PortalConfig) {
  const declarations = Object.entries(portalCssVariables(config))
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `html:root{${declarations}}.portal-theme.portal-theme{${declarations}}`;
}
