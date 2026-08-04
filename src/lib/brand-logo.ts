import { emailAssetPath } from "@/lib/email-asset-urls";
import { prisma } from "@/lib/prisma";

/**
 * Logo de l'entreprise repris en en-tête de tous les emails sortants, et
 * proposé en un clic dans les éditeurs de modèles (bouton « Insérer le logo »).
 *
 * Il était jusqu'ici figé sur `public/logoIdeeri.jpeg` : changer d'identité
 * visuelle demandait un déploiement. Il est désormais téléversable depuis
 * Paramètres > Général et rangé comme les autres visuels publics
 * (`PortalAsset`), donc servi sans authentification — c'est le client mail du
 * destinataire qui vient le chercher, et il n'a pas de session.
 *
 * Le fichier livré avec l'application reste le repli : tant que personne n'a
 * téléversé de logo, les emails gardent exactement l'apparence qu'ils avaient.
 */

export const BRAND_LOGO_SETTING_KEY = "brand_logo_asset_id";

/** Fichier livré avec l'application, utilisé tant qu'aucun logo n'est téléversé. */
const FALLBACK_LOGO_PATH = "/logoIdeeri.jpeg";

/**
 * Chemin du logo, relatif à la racine.
 *
 * Relatif et non absolu, pour deux raisons. Dans un email, l'origine publique
 * est ajoutée à l'envoi (voir `email-asset-urls.ts`) : la construire ici la
 * ferait aussi enregistrer en base par le bouton « Insérer le logo » des
 * éditeurs, et le modèle partirait pour toujours avec l'origine de
 * l'environnement où l'admin a cliqué. Dans le back-office, un chemin relatif
 * est par ailleurs exactement ce qu'il faut : le navigateur le résout seul.
 */
export async function getBrandLogoUrl(): Promise<string> {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: BRAND_LOGO_SETTING_KEY },
  });

  if (setting?.value) {
    return emailAssetPath(setting.value);
  }
  return FALLBACK_LOGO_PATH;
}
