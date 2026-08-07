import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isSearchableName,
  subjectPseudonym,
  type SubjectKind,
} from "@/lib/privacy-subject";

/**
 * Effacer une identité DANS le journal d'audit, sans effacer le journal.
 *
 * C'est le cœur du sujet, et le seul endroit du code autorisé à modifier une
 * trace. Le journal est en ajout seul, garanti par un déclencheur Postgres ; il
 * faut donc expliquer pourquoi ce fichier existe.
 *
 * Une ligne de journal porte deux choses de nature différente. Le FAIT : telle
 * action, à telle heure, sur tel ticket — c'est ce qu'un audit vient vérifier, et
 * ça ne doit jamais bouger. L'IDENTITÉ de la personne : son nom et son email,
 * recopiés dans `actorName`/`actorEmail` pour survivre à la suppression de son
 * compte, et parfois écrits en clair dans `summary` (« Compte X (x@…) »,
 * « réponse rédigée par X ») ou dans `changes` (« Assigné à : X → … »). Quand
 * cette personne demande l'effacement de ses données, c'est la seconde qui doit
 * disparaître, pas la première.
 *
 * D'où ce module : il remplace l'identité par la forme pseudonyme et ne touche à
 * rien d'autre. Après son passage, le journal se lit encore intégralement —
 * « Personne anonymisée (a1b2c3) a consulté le ticket #128 le 4 mars à 14 h 02 » —
 * mais plus personne ne peut savoir de qui il s'agissait.
 *
 * Tout se joue en UNE transaction, pour deux raisons : le drapeau qui ouvre le
 * déclencheur est posé par `SET LOCAL`, donc valable pour la transaction seule
 * (aucun autre code ne peut en profiter par ricochet) ; et une pseudonymisation à
 * moitié faite laisserait une identité éparpillée dans le journal, ce qui est le
 * pire des deux mondes. En cas d'échec, tout est annulé.
 */

/** Ce que la réécriture a effectivement touché — repris dans la trace d'audit. */
export type JournalPseudonymization = {
  /** Traces dont la personne était l'auteur (`actorId`). */
  authoredEntries: number;
  /** Traces où son nom ou son email était écrit dans le résumé ou le différentiel. */
  mentionEntries: number;
  /** Nom laissé en place parce que trop court pour être cherché sans dégât. */
  nameLeftInPlace: boolean;
};

/**
 * Échappement pour une expression régulière POSIX (celle de `regexp_replace`).
 *
 * Indispensable sur un email : le point de « prenom.nom@… » signifie « n'importe
 * quel caractère » dans une expression régulière. Sans échappement, effacer
 * `a.b@x.fr` effacerait aussi `axb@xxfr` — et, plus grave, la moindre parenthèse
 * dans un nom rendrait le motif invalide, donc la transaction en erreur.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.^$*+?()[\]{}|\\]/g, "\\$&");
}

/**
 * Caractères qui, collés au nom, signalent qu'on lit le nom de QUELQU'UN D'AUTRE.
 *
 * Les lettres et chiffres, évidemment (« Jean Dupontel »), mais aussi le trait
 * d'union et l'apostrophe : « Jean Dupont-Rivière » et « Jean Dupont » sont deux
 * personnes. `[[:alnum:]]` suit la locale de la base et couvre donc les lettres
 * accentuées — « Jean Duponté » n'est pas « Jean Dupont ».
 */
const NAME_ADJACENT = "[[:alnum:]_'-]";

/**
 * Motif reconnaissant un nom écrit en toutes lettres, et lui seul.
 *
 * Deux contraintes de VOISINAGE, et rien d'autre : le caractère qui précède et
 * celui qui suit ne doivent pas prolonger un nom. Écrit ainsi plutôt qu'avec la
 * frontière de mot `\y` de Postgres, pour deux raisons vérifiées par test :
 *
 * — `\y` ne suffit pas contre l'homonyme partiel. Le trait d'union n'étant pas
 *   alphanumérique, il y a une frontière de mot juste après « Dupont » dans
 *   « Jean Dupont-Rivière » : effacer « Jean Dupont » mutilait le nom d'un TIERS
 *   pour protéger quelqu'un d'autre.
 *
 * — `\y` parle des DEUX côtés de sa position, donc aussi du nom lui-même. Un nom
 *   terminé par autre chose qu'une lettre — « Jean Dupont Jr. », ou le pseudonyme
 *   « Personne anonymisée (a1b2c3) » — n'était alors JAMAIS reconnu : une
 *   deuxième passe d'anonymisation ne trouvait plus rien, en silence.
 */
function wordPattern(value: string): string {
  return `(?<!${NAME_ADJACENT})${escapeRegex(value)}(?!${NAME_ADJACENT})`;
}

export async function pseudonymizeSubjectInJournal({
  kind,
  subjectId,
  name,
  email,
}: {
  kind: SubjectKind;
  subjectId: string;
  name: string;
  email: string;
}): Promise<JournalPseudonymization> {
  const pseudonym = subjectPseudonym(subjectId);
  const searchName = isSearchableName(name);

  const emailPattern = escapeRegex(email);
  // L'email est TOUJOURS cherché : il est unique par construction, donc une
  // correspondance ne peut pas désigner quelqu'un d'autre. Le nom ne l'est que
  // s'il est assez distinctif (voir `isSearchableName`).
  const matcher = searchName ? `${wordPattern(name)}|${emailPattern}` : emailPattern;

  /** `column` avec l'identité remplacée — imbriqué, donc en une seule passe SQL. */
  const anonymize = (column: Prisma.Sql) => {
    const withoutEmail = Prisma.sql`regexp_replace(${column}, ${emailPattern}, ${pseudonym.email}, 'g')`;
    if (!searchName) return withoutEmail;
    return Prisma.sql`regexp_replace(${withoutEmail}, ${wordPattern(name)}, ${pseudonym.name}, 'g')`;
  };

  return prisma.$transaction(
    async (tx) => {
      // Le drapeau attendu par le déclencheur `audit_logs_reject_update`.
      //
      // `set_config(…, true)` et non `SET LOCAL` : le troisième argument à `true`
      // en fait exactement l'équivalent (le réglage retombe à la fin de cette
      // transaction, quoi qu'il arrive), mais c'est un simple `SELECT` — donc une
      // requête que le pilote peut préparer et paramétrer comme les autres, là où
      // `SET` est une commande utilitaire dont le passage par le protocole étendu
      // dépend du pilote.
      await tx.$queryRaw`SELECT set_config('ideeri.audit_pseudonymize', 'on', true)`;

      // 1. Les traces dont la personne est l'AUTEUR. Un client n'est l'auteur
      //    d'aucune trace (le journal ne suit que les gestes de l'équipe) : lancer
      //    la requête pour lui ne trouverait rien et laisserait croire le
      //    contraire à la lecture du code.
      const authoredEntries =
        kind === "AGENT"
          ? (
              await tx.auditLog.updateMany({
                where: { actorId: subjectId },
                data: { actorName: pseudonym.name, actorEmail: pseudonym.email },
              })
            ).count
          : 0;

      // 2. Les traces qui la NOMMENT sans qu'elle en soit l'auteur : le résumé
      //    d'une modification de son compte, la validation d'une de ses réponses,
      //    un différentiel d'assignation.
      //
      //    Un seul `UPDATE` et non une boucle de lectures-écritures : le journal
      //    peut compter des centaines de milliers de lignes, et une transaction
      //    qui les reprend une à une dépasserait son délai avant d'avoir fini —
      //    laissant tout annulé, donc l'identité en place.
      //
      //    Le cast final en `jsonb` est un garde-fou gratuit : si le remplacement
      //    avait pu casser la structure du différentiel, la transaction échouerait
      //    ici au lieu d'écrire un JSON invalide.
      const mentionEntries = await tx.$executeRaw`
        UPDATE "audit_logs"
        SET "summary" = ${anonymize(Prisma.sql`"summary"`)},
            "changes" = (${anonymize(Prisma.sql`"changes"::text`)})::jsonb
        WHERE "summary" ~ ${matcher}
           OR "changes"::text ~ ${matcher}
      `;

      return { authoredEntries, mentionEntries, nameLeftInPlace: !searchName };
    },
    // Le second `UPDATE` parcourt le journal en entier (aucun index ne porte sur
    // le contenu d'un résumé) : le délai par défaut de cinq secondes est trop
    // court dès que la table grossit, et son dépassement annulerait un
    // effacement pourtant demandé.
    { timeout: 60_000, maxWait: 10_000 },
  );
}
