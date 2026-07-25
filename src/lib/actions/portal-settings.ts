"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import {
  PORTAL_DEFAULTS,
  portalLinkSchema,
  portalSettingsSchema,
  type PortalConfig,
  type PortalLink,
} from "@/lib/portal-theme";

const linksSchema = z.array(portalLinkSchema);

// Les colonnes Json sont libres côté base : on retombe sur une liste vide plutôt
// que de faire planter le portail public si le contenu ne correspond plus.
function parseLinks(value: unknown): PortalLink[] {
  const parsed = linksSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Configuration complète du portail, valeurs par défaut incluses. Appelée par
 * les pages publiques : aucun contrôle d'accès (aucune donnée sensible).
 */
export async function getPortalSettings(): Promise<PortalConfig> {
  const settings = await prisma.portalSettings.findFirst();
  if (!settings) return PORTAL_DEFAULTS;

  return {
    siteName: settings.siteName,
    tagline: settings.tagline,
    showTagline: settings.showTagline,
    showLogo: settings.showLogo,
    showSiteName: settings.showSiteName,
    logoAssetId: settings.logoAssetId,
    logoHeight: settings.logoHeight,
    faviconAssetId: settings.faviconAssetId,
    metaTitle: settings.metaTitle,
    metaDescription: settings.metaDescription,

    colorMode: settings.colorMode,
    primaryColor: settings.primaryColor,
    primaryForegroundColor: settings.primaryForegroundColor,
    backgroundColor: settings.backgroundColor,
    foregroundColor: settings.foregroundColor,
    cardColor: settings.cardColor,
    borderColor: settings.borderColor,
    mutedColor: settings.mutedColor,
    mutedForegroundColor: settings.mutedForegroundColor,
    radius: settings.radius,
    fontSans: settings.fontSans,
    fontDisplay: settings.fontDisplay,

    navVariant: settings.navVariant,
    navSticky: settings.navSticky,
    navBlur: settings.navBlur,
    navBordered: settings.navBordered,
    navShowFaq: settings.navShowFaq,
    navShowLogin: settings.navShowLogin,
    navCtaEnabled: settings.navCtaEnabled,
    navCtaLabel: settings.navCtaLabel,
    navLinks: parseLinks(settings.navLinks),

    heroEnabled: settings.heroEnabled,
    heroEyebrow: settings.heroEyebrow,
    heroTitle: settings.heroTitle,
    introMessage: settings.introMessage,
    heroAlign: settings.heroAlign,
    heroGlow: settings.heroGlow,

    cardsEnabled: settings.cardsEnabled,
    faqCardTitle: settings.faqCardTitle,
    faqCardText: settings.faqCardText,
    faqCardIcon: settings.faqCardIcon,
    ticketCardTitle: settings.ticketCardTitle,
    ticketCardText: settings.ticketCardText,
    ticketCardIcon: settings.ticketCardIcon,

    faqEnabled: settings.faqEnabled,
    faqEyebrow: settings.faqEyebrow,
    faqTitle: settings.faqTitle,
    faqSearchEnabled: settings.faqSearchEnabled,

    footerEnabled: settings.footerEnabled,
    footerText: settings.footerText,
    footerIcon: settings.footerIcon,
    footerLinks: parseLinks(settings.footerLinks),
  };
}

function revalidatePortal() {
  revalidatePath("/settings/portal");
  revalidatePath("/");
  revalidatePath("/faq");
  revalidatePath("/nouveau-ticket");
}

export async function savePortalSettings(input: unknown) {
  await requireAdmin();
  const data = portalSettingsSchema.parse(input);

  const existing = await prisma.portalSettings.findFirst();
  if (existing) {
    await prisma.portalSettings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.portalSettings.create({ data });
  }

  revalidatePortal();
}

/** Remet tous les réglages du portail à leurs valeurs d'origine. */
export async function resetPortalSettings() {
  await requireAdmin();
  const existing = await prisma.portalSettings.findFirst();
  if (existing) {
    await prisma.portalSettings.update({ where: { id: existing.id }, data: PORTAL_DEFAULTS });
  }
  revalidatePortal();
}

/**
 * Détache un visuel (logo ou favicon) et supprime le fichier stocké. On garde
 * l'ordre « détacher puis supprimer » : l'inverse laisserait le portail pointer
 * un instant vers un id inexistant.
 */
export async function deletePortalAsset(kind: "logo" | "favicon") {
  await requireAdmin();
  const existing = await prisma.portalSettings.findFirst();
  if (!existing) return;

  const assetId = kind === "logo" ? existing.logoAssetId : existing.faviconAssetId;
  if (!assetId) return;

  await prisma.portalSettings.update({
    where: { id: existing.id },
    data: kind === "logo" ? { logoAssetId: null } : { faviconAssetId: null },
  });
  await prisma.portalAsset.deleteMany({ where: { id: assetId } });

  revalidatePortal();
}
