/**
 * Polices sélectionnables pour le portail public.
 *
 * `next/font` impose sa forme d'écriture : un appel par police, affecté à une
 * const au niveau du module, avec des options littérales (ni variable, ni appel
 * de fonction, ni objet partagé). Impossible donc de charger « la police choisie
 * en base » à la demande : on déclare toutes les options ici, et le portail
 * applique la classe de celle qui est configurée. Les noms de variables CSS
 * doivent rester alignés avec `portalFontVarName()` de src/lib/portal-theme.ts,
 * qui les reconstruit pour générer le thème.
 *
 * `preload: false` évite un <link rel="preload"> pour les fontes non retenues :
 * le navigateur ne télécharge que celle que le CSS utilise réellement.
 */

import {
  DM_Sans,
  Figtree,
  Fraunces,
  Geist,
  Instrument_Serif,
  Inter,
  Manrope,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-inter",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-geist",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-manrope",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-dm-sans",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-plus-jakarta",
});

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-figtree",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  axes: ["opsz", "SOFT"],
  variable: "--font-portal-fraunces",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-playfair",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-portal-instrument-serif",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-space-grotesk",
});

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-portal-outfit",
});

// Les clés doivent correspondre à PORTAL_SANS_FONTS / PORTAL_DISPLAY_FONTS.
export const PORTAL_FONTS: Record<string, { variable: string }> = {
  inter,
  geist,
  manrope,
  "dm-sans": dmSans,
  "plus-jakarta": plusJakarta,
  figtree,
  fraunces,
  playfair,
  "instrument-serif": instrumentSerif,
  "space-grotesk": spaceGrotesk,
  outfit,
};

/**
 * Classes à poser sur le conteneur du portail pour que les variables CSS des
 * polices choisies soient déclarées (une police non appliquée ne déclare pas sa
 * variable, `--font-sans: var(--font-portal-manrope)` resterait vide).
 */
export function portalFontClassNames(fontSans: string, fontDisplay: string) {
  const keys = [...new Set([fontSans, fontDisplay, "inter"])];
  return keys
    .map((key) => PORTAL_FONTS[key]?.variable)
    .filter(Boolean)
    .join(" ");
}
