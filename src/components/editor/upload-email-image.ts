/**
 * Téléverse une image destinée à un email et renvoie son chemin **relatif**.
 *
 * Partagé par tous les éditeurs dont le contenu part par email — signature,
 * accusé de réception, message de clôture, gabarit commun. Un client mail ne
 * résout aucun chemin relatif, mais l'origine publique n'entre pas dans le
 * contenu enregistré : elle est ajoutée à l'envoi (voir `email-asset-urls.ts`),
 * pour qu'un modèle reste valable quel que soit l'environnement.
 *
 * L'image est rangée en visuel public (voir /api/signatures/images), donc
 * servie sans authentification — c'est le client mail du destinataire qui vient
 * la chercher, et il n'a évidemment pas de session.
 */
export async function uploadEmailImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/signatures/images", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Envoi de l'image impossible");
  }

  const body = await response.json();
  return body.url as string;
}
