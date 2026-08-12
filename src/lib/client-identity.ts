import { prisma } from "@/lib/prisma";

/**
 * À quel contact rattacher un ticket qui arrive.
 *
 * Un seul endroit du code répond à cette question, pour tous les canaux — email
 * entrant, formulaire du widget, portail public. C'était jusqu'ici un `upsert`
 * recopié dans chaque chemin d'écriture, et la divergence était déjà là : le
 * widget écrasait le nom en base, la synchro Gmail non. Les deux règles
 * subsistent, mais elles sont maintenant énoncées ici (`trustName`) au lieu
 * d'être devinables en comparant deux fichiers.
 *
 * DEUX ÉTAPES :
 *
 * 1. **La fiche portant cette adresse, créée si elle n'existe pas.** Un `upsert`
 *    et non un « chercher puis créer » : deux emails du même expéditeur traités de
 *    près se disputeraient la création, et l'un des deux échouerait sur l'unicité
 *    de `Client.email`.
 *
 * 2. **Si cette fiche a été fusionnée, on remonte au contact actif.** C'est ce
 *    qui fait tenir une fusion dans le temps : la personne continue d'écrire
 *    depuis l'adresse absorbée, et son message doit rejoindre le dossier unique
 *    qu'un agent a pris la peine de constituer. Sans cette étape, la fusion
 *    serait défaite au premier email.
 */
export async function resolveTicketClient({
  email,
  name,
  trustName,
}: {
  /** Adresse de l'expéditeur, DÉJÀ normalisée en minuscules par l'appelant. */
  email: string;
  /** Nom proposé par le canal : nom affiché de l'email, ou champ du formulaire. */
  name?: string | null;
  /**
   * Le nom proposé est-il assez fiable pour écraser celui déjà en base ?
   *
   * `true` pour un formulaire — la personne vient de le saisir elle-même.
   * `false` pour un email entrant : un nom affiché vaut souvent « jean »,
   * « Compta » ou l'adresse elle-même, et remplacerait une fiche correctement
   * renseignée par le réglage d'un client mail.
   */
  trustName: boolean;
}): Promise<{ id: string }> {
  const trimmedName = name?.trim() || null;
  const rename = trustName && trimmedName ? { name: trimmedName } : {};

  const matched = await prisma.client.upsert({
    where: { email },
    update: rename,
    create: { name: trimmedName ?? email, email },
    select: { id: true, mergedIntoId: true },
  });

  // Le renommage a porté sur la fiche TROUVÉE, c'est-à-dire celle de l'adresse
  // d'où le message vient — et non sur le contact actif. C'est voulu : la fiche
  // absorbée garde sa propre identité, c'est ce qui permet de la détacher plus
  // tard et de retrouver qui elle désignait.
  if (!matched.mergedIntoId) return { id: matched.id };

  return { id: await resolveClientMergeRoot(matched.id) };
}

/**
 * Profondeur maximale suivie en remontant une chaîne de fusions.
 *
 * Garde-fou anti-cycle, calqué sur `resolveMergeRoot` côté tickets : deux agents
 * fusionnant A→B et B→A au même instant produiraient une boucle, et une requête
 * sans fin sur le chemin d'un email entrant est le pire endroit pour la découvrir.
 */
const MAX_MERGE_DEPTH = 20;

/**
 * Remonte jusqu'au contact réellement actif d'une chaîne de fusions.
 *
 * Renvoie l'identifiant de départ si la fiche n'est pas fusionnée, ou si la
 * chaîne est anormalement longue — mieux vaut rattacher le ticket à une fiche
 * imparfaite que le perdre. L'anomalie est signalée dans les logs, jamais à la
 * personne qui vient d'écrire.
 */
export async function resolveClientMergeRoot(clientId: string): Promise<string> {
  let currentId = clientId;

  for (let depth = 0; depth < MAX_MERGE_DEPTH; depth += 1) {
    const current = await prisma.client.findUnique({
      where: { id: currentId },
      select: { mergedIntoId: true },
    });
    if (!current?.mergedIntoId) return currentId;
    currentId = current.mergedIntoId;
  }

  console.error(
    `[client-merge] chaîne de fusion anormalement longue depuis le contact ${clientId} : ` +
      `rattachement au dernier maillon atteint, à vérifier.`,
  );
  return currentId;
}
