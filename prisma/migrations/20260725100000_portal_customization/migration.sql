-- CreateEnum
CREATE TYPE "PortalColorMode" AS ENUM ('LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "PortalNavVariant" AS ENUM ('LOGO_LEFT', 'LINKS_CENTER', 'CENTERED', 'MINIMAL');

-- CreateEnum
CREATE TYPE "PortalAlign" AS ENUM ('LEFT', 'CENTER');

-- AlterTable
ALTER TABLE "portal_settings"
    ADD COLUMN "siteName" TEXT NOT NULL DEFAULT 'Ideeri',
    ADD COLUMN "tagline" TEXT DEFAULT 'Support',
    ADD COLUMN "showTagline" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "showLogo" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "showSiteName" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "logoAssetId" TEXT,
    ADD COLUMN "logoHeight" INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN "faviconAssetId" TEXT,
    ADD COLUMN "metaTitle" TEXT,
    ADD COLUMN "metaDescription" TEXT,
    ADD COLUMN "colorMode" "PortalColorMode" NOT NULL DEFAULT 'LIGHT',
    ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#ecb300',
    ADD COLUMN "primaryForegroundColor" TEXT NOT NULL DEFAULT '#0a0a0a',
    ADD COLUMN "backgroundColor" TEXT,
    ADD COLUMN "foregroundColor" TEXT,
    ADD COLUMN "cardColor" TEXT,
    ADD COLUMN "borderColor" TEXT,
    ADD COLUMN "mutedColor" TEXT,
    ADD COLUMN "mutedForegroundColor" TEXT,
    ADD COLUMN "radius" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    ADD COLUMN "fontSans" TEXT NOT NULL DEFAULT 'inter',
    ADD COLUMN "fontDisplay" TEXT NOT NULL DEFAULT 'fraunces',
    ADD COLUMN "navVariant" "PortalNavVariant" NOT NULL DEFAULT 'LOGO_LEFT',
    ADD COLUMN "navSticky" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navBlur" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navBordered" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navShowFaq" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navShowLogin" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navCtaEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "navCtaLabel" TEXT NOT NULL DEFAULT 'Créer un ticket',
    ADD COLUMN "navLinks" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "heroEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "heroEyebrow" TEXT DEFAULT 'Centre d''aide Ideeri',
    ADD COLUMN "heroTitle" TEXT DEFAULT 'Comment pouvons-nous vous aider ?',
    ADD COLUMN "heroAlign" "PortalAlign" NOT NULL DEFAULT 'CENTER',
    ADD COLUMN "heroGlow" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "cardsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "faqCardTitle" TEXT NOT NULL DEFAULT 'Consulter la FAQ',
    ADD COLUMN "faqCardText" TEXT NOT NULL DEFAULT 'Les réponses aux questions les plus fréquentes sur nos logiciels, classées par produit.',
    ADD COLUMN "faqCardIcon" TEXT NOT NULL DEFAULT 'BookOpen',
    ADD COLUMN "ticketCardTitle" TEXT NOT NULL DEFAULT 'Créer un ticket',
    ADD COLUMN "ticketCardText" TEXT NOT NULL DEFAULT 'Une question précise ou un problème ? Décrivez votre demande, nous vous répondons par email.',
    ADD COLUMN "ticketCardIcon" TEXT NOT NULL DEFAULT 'MessagesSquare',
    ADD COLUMN "faqEyebrow" TEXT DEFAULT 'Foire aux questions',
    ADD COLUMN "faqTitle" TEXT DEFAULT 'Trouvez votre réponse',
    ADD COLUMN "faqSearchEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "footerEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "footerText" TEXT DEFAULT 'Support Ideeri',
    ADD COLUMN "footerIcon" TEXT NOT NULL DEFAULT 'LifeBuoy',
    ADD COLUMN "footerLinks" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "portal_assets" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_assets_pkey" PRIMARY KEY ("id")
);
