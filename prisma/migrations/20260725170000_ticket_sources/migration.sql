-- CreateEnum
CREATE TYPE "SourceFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX', 'FILE', 'HEADER');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "formSourceId" TEXT;

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ticketSource" "TicketSource" NOT NULL DEFAULT 'WIDGET_PAPAIRIS',
    "logoUrl" TEXT,
    "formTitle" TEXT NOT NULL DEFAULT 'Contacter le support',
    "formDescription" TEXT,
    "submitLabel" TEXT NOT NULL DEFAULT 'Envoyer',
    "successMessage" TEXT,
    "showCategoryField" BOOLEAN NOT NULL DEFAULT true,
    "allowAttachments" BOOLEAN NOT NULL DEFAULT true,
    "showBannerMessage" BOOLEAN NOT NULL DEFAULT true,
    "useGlobalCustomFields" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_fields" (
    "id" TEXT NOT NULL,
    "type" "SourceFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "placeholder" TEXT,
    "helpText" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "source_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "source_fields_sourceId_idx" ON "source_fields"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "source_fields_sourceId_key_key" ON "source_fields"("sourceId", "key");

-- CreateIndex
CREATE INDEX "tickets_formSourceId_idx" ON "tickets"("formSourceId");

-- AddForeignKey
ALTER TABLE "source_fields" ADD CONSTRAINT "source_fields_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_formSourceId_fkey" FOREIGN KEY ("formSourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sources existantes reprises à l'identique du comportement actuel : le widget
-- embarqué dans Papairis et le formulaire du portail public. Idempotent, pour
-- que la migration reste rejouable sur une base déjà amorcée.
INSERT INTO "sources" (
    "id", "name", "slug", "description", "isActive", "ticketSource",
    "formTitle", "formDescription", "submitLabel", "createdAt", "updatedAt"
) VALUES (
    'src_widget_papairis',
    'Widget Papairis',
    'widget-papairis',
    'Formulaire de contact embarqué dans Papairis.',
    true,
    'WIDGET_PAPAIRIS',
    'Contacter le support',
    'Décrivez votre problème, nous vous répondrons rapidement.',
    'Envoyer',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
), (
    'src_portail',
    'Portail public',
    'portail',
    'Formulaire de création de ticket du portail public.',
    true,
    'PORTAL',
    'Créer un ticket',
    'Donnez-nous le plus de détails possible. Nous vous répondons par email.',
    'Envoyer la demande',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("slug") DO NOTHING;

-- Rattachement des tickets déjà en base à la source correspondant à leur enum.
UPDATE "tickets" SET "formSourceId" = 'src_widget_papairis'
  WHERE "source" = 'WIDGET_PAPAIRIS' AND "formSourceId" IS NULL;
UPDATE "tickets" SET "formSourceId" = 'src_portail'
  WHERE "source" = 'PORTAL' AND "formSourceId" IS NULL;
