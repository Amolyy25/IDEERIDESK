/**
 * Adresses des visuels d'email : enregistrées relatives, rendues absolues à
 * l'envoi.
 *
 * Un client mail n'a aucune notion de « page courante » : un `src` relatif ne
 * s'y affiche nulle part. L'adresse doit donc être absolue **dans l'email**.
 *
 * Elle ne doit pour autant jamais être écrite absolue en base. L'origine
 * publique est une donnée d'environnement (`APP_URL`) : figée dans le HTML au
 * moment de l'enregistrement, elle survit au changement d'environnement et
 * continue de désigner la machine où l'admin a cliqué sur « Enregistrer ». Un
 * modèle enregistré en développement part ainsi chez le client avec
 * `http://localhost:3002/…` — une image que rien ne répare, pas même une
 * `APP_URL` corrigée ensuite, puisque l'adresse est déjà dans la ligne.
 *
 * D'où la règle tenue par ce module : la base ne porte que des chemins
 * relatifs, et l'origine est ajoutée une seule fois, à l'envoi, par
 * `renderEmailLayout`.
 *
 * Module pur (ni base de données, ni `process.env`) : les aperçus des réglages
 * l'exécutent dans le navigateur, où un chemin relatif s'affiche tel quel.
 */

export const EMAIL_ASSET_BASE_PATH = "/api/portal/assets";

/** Chemin d'un visuel, sous la forme sous laquelle il doit être enregistré. */
export function emailAssetPath(assetId: string): string {
  return `${EMAIL_ASSET_BASE_PATH}/${assetId}`;
}

// `src="/…"` : un seul `/`, pour laisser tranquilles les adresses
// protocol-relative (`//cdn…`), déjà absolues pour un client mail.
const ROOT_RELATIVE_SRC = /(\ssrc\s*=\s*)(["'])(\/(?!\/)[^"']*)\2/gi;

/**
 * Préfixe d'`origin` chaque `src` relatif à la racine.
 *
 * Sans origine, rend le HTML inchangé : c'est le cas des aperçus affichés dans
 * le navigateur, qui résolvent eux-mêmes le chemin.
 */
export function absolutizeEmailAssetUrls(html: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!base) return html;

  return html.replace(
    ROOT_RELATIVE_SRC,
    (_match, prefix: string, quote: string, path: string) =>
      `${prefix}${quote}${base}${path}${quote}`
  );
}
