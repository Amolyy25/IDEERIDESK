"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { BRAND_LOGO_SETTING_KEY, getBrandLogoUrl } from "@/lib/brand-logo";

/**
 * Choix du logo repris dans les emails. Réservé aux administrateurs, comme tous
 * les réglages : ce visuel part chez tous les clients.
 */

export type BrandLogoStatus = {
  /** Chemin relatif affiché en aperçu, repli compris. */
  url: string;
  /** `false` tant que personne n'a téléversé de logo : c'est celui livré avec l'application. */
  isCustom: boolean;
};

export async function getBrandLogoStatus(): Promise<BrandLogoStatus> {
  await requirePermission("settings.workspace");

  const setting = await prisma.globalSetting.findUnique({
    where: { key: BRAND_LOGO_SETTING_KEY },
  });

  return { url: await getBrandLogoUrl(), isCustom: Boolean(setting?.value) };
}

const assetSchema = z.object({ assetId: z.string().min(1) });

/**
 * Enregistre le visuel téléversé comme logo de l'application.
 *
 * Le fichier lui-même est déjà passé par /api/signatures/images (contrôle du
 * format, de la taille, et rangement en `PortalAsset`) : il ne reste ici qu'à
 * désigner lequel fait foi. L'existence du visuel est revérifiée, sinon un
 * identifiant inventé laisserait une image morte en en-tête de tous les emails.
 */
export async function setBrandLogo(input: z.infer<typeof assetSchema>) {
  await requirePermission("settings.workspace");
  const { assetId } = assetSchema.parse(input);

  const asset = await prisma.portalAsset.findUnique({
    where: { id: assetId },
    select: { id: true },
  });
  if (!asset) {
    throw new Error("Visuel introuvable : le téléversement n'a pas abouti.");
  }

  await prisma.globalSetting.upsert({
    where: { key: BRAND_LOGO_SETTING_KEY },
    update: { value: assetId },
    create: {
      key: BRAND_LOGO_SETTING_KEY,
      value: assetId,
      label: "Logo des emails",
      description:
        "Visuel repris en en-tête des emails sortants et proposé dans les éditeurs de modèles.",
    },
  });

  revalidateLogoConsumers();
}

/** Revient au logo livré avec l'application. */
export async function clearBrandLogo() {
  await requirePermission("settings.workspace");
  await prisma.globalSetting.deleteMany({ where: { key: BRAND_LOGO_SETTING_KEY } });
  revalidateLogoConsumers();
}

/**
 * Toutes les pages qui affichent ou insèrent le logo. Listées explicitement :
 * un logo changé qui continue d'apparaître à l'ancien dans un éditeur de modèle
 * donne l'impression que l'enregistrement a échoué.
 */
function revalidateLogoConsumers() {
  revalidatePath("/settings/general");
  revalidatePath("/settings/signatures");
  revalidatePath("/settings/closure");
  revalidatePath("/settings/acknowledgement");
  revalidatePath("/settings/email-layout");
}
