-- AlterTable
ALTER TABLE "custom_fields" ADD COLUMN     "autofillFromSourceUrl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "helpText" TEXT;

-- AlterTable
ALTER TABLE "global_settings" ADD COLUMN     "multiline" BOOLEAN NOT NULL DEFAULT false;
