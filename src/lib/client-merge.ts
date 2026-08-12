import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { plural } from "@/lib/utils";
import { EMAIL_METADATA_KEY, readInboundEmailMetadata } from "@/lib/inbound-email-metadata";
import {
  MERGEABLE_FIELDS,
  MERGEABLE_FIELD_LABELS,
  sameValue,
  type ClientMergeSelection,
  type MergeableField,
} from "@/lib/client-merge-fields";

/**
 * Fusion de plusieurs fiches contacts qui désignent la même personne, et son
 * annulation.
 *
 * MODÈLE RETENU, le même que pour les tickets (`ticket-merge.ts`) : la fusion NE
 * DÉTRUIT RIEN. La fiche absorbée garde son nom, son adresse et sa date de
 * création ; elle est simplement rattachée au contact actif (`mergedIntoId`) et
 * cesse d'être un contact à part entière. Ce qui bouge, ce sont ses TICKETS, qui
 * rejoignent la fiche conservée — c'est là tout l'intérêt : un seul dossier, un
 * seul interlocuteur.
 *
 * Trois choses découlent de ce choix, et aucune n'est un détail :
 *
 * 1. **La fusion se défait** (`unmergeClient`). Chaque ticket déplacé retient la
 *    fiche dont il a été pris, dans `metadata._mergedFrom` : c'est ce qui permet
 *    de rendre à chacun ce qui était à lui, même après plusieurs fusions
 *    enchaînées. La valeur n'est écrite que si elle est ABSENTE, donc elle
 *    désigne toujours la fiche d'ORIGINE du ticket, jamais un intermédiaire.
 *
 * 2. **La fusion tient dans le temps.** La personne continue d'écrire depuis
 *    l'adresse absorbée ; la fiche existant toujours, c'est elle que la
 *    résolution retrouve, et elle remonte au contact actif (voir
 *    `resolveTicketClient`). Une fusion qui aurait supprimé la fiche verrait le
 *    prochain email recréer le doublon qu'on venait d'effacer.
 *
 * 3. **L'adresse de réponse de certains tickets change.** Une réponse part à
 *    `ticket.client.email` : un ticket déplacé vers la fiche conservée sera
 *    désormais répondu à l'adresse de celle-ci. C'est le sens même de la fusion
 *    — c'est la même personne — mais ça ne doit pas se découvrir après coup,
 *    d'où la note interne déposée sur exactement ces tickets. L'adresse
 *    d'origine, elle, reste dans les en-têtes de l'email reçu
 *    (`metadata._email`).
 *
 * Ce que la fusion NE rend PAS au détachement : les coordonnées arbitrées sur la
 * fiche conservée. Rien n'est perdu pour autant — chaque valeur d'origine est
 * restée sur sa propre fiche — mais l'ancienne valeur de la fiche conservée,
 * elle, a bien été remplacée. L'écran de détachement le dit.
 *
 * Enfin, le journal d'audit ne recopie jamais l'identité des fiches absorbées.
 * Il est nettoyé d'une identité en cherchant le nom et l'email COURANTS d'une
 * personne (voir `pseudonymizeSubjectInJournal`) : une identité recopiée dans un
 * résumé, mais rattachée à une AUTRE fiche que celle qu'on anonymise, échapperait
 * à cette recherche et resterait en clair pour toujours.
 */

export class ClientMergeError extends Error {}

// Le vocabulaire partagé avec la fenêtre — champs arbitrables, libellés,
// plafond, comparaison de valeurs — vit dans `client-merge-fields.ts` : ce
// fichier-ci importe Prisma, un composant client ne peut donc pas s'y servir.

export type ClientMergeOutcome = {
  survivorId: string;
  survivorName: string;
  /** Fiches rattachées à la fiche conservée — conservées, non supprimées. */
  absorbedCount: number;
  /** Tickets qui ont changé de fiche. */
  movedTicketCount: number;
  /** Tickets dont l'adresse de réponse a changé, et qui portent donc une note. */
  warnedTicketCount: number;
  /** Champs dont la valeur retenue n'était pas celle de la fiche conservée. */
  replacedFields: MergeableField[];
  /** Tickets repris à la main parmi ceux venus de ces adresses (voir `claimTicketIds`). */
  claimedTicketCount: number;
};

export type ClientUnmergeOutcome = {
  /** Fiche redevenue un contact autonome. */
  clientId: string;
  clientName: string;
  /** Contact dont elle vient d'être détachée. */
  previousName: string;
  /** Tickets rendus à cette fiche. */
  restoredTicketCount: number;
  /**
   * Fiches que celle-ci avait elle-même absorbées et qui la suivent : elles
   * restent rattachées à elle, elle redevient leur contact actif.
   */
  followingCount: number;
};

// ---------------------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------------------

/**
 * Un ticket venu d'une des adresses en jeu mais rattaché ailleurs.
 *
 * Montré à l'agent AVANT la fusion, avec le nom du contact qui le porte
 * aujourd'hui : c'est la seule façon honnête de proposer de le reprendre. Un
 * balayage silencieux retirerait un dossier à un tiers sans que personne ne
 * puisse le constater.
 */
export type ReclaimableTicket = {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  /** Adresse d'origine du message, telle qu'elle figure dans ses en-têtes. */
  originEmail: string;
  /** Contact qui le porte aujourd'hui, `null` s'il n'en a plus. */
  currentClient: { id: string; name: string } | null;
  /**
   * Reprenable ? Faux pour un ticket sans contact : c'est presque toujours
   * l'orphelin d'une suppression au titre du droit à l'effacement, et le
   * rattacher défairait cet effacement. Montré quand même, avec sa raison —
   * l'agent doit savoir que ce ticket existe.
   */
  claimable: boolean;
};

export type ReclaimableSearch = {
  tickets: ReclaimableTicket[];
  /** La recherche a été bornée : d'autres tickets existent, non montrés. */
  truncated: boolean;
};

/** Ce que la fusion a besoin de lire d'une fiche. */
const mergeSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  anonymizedAt: true,
  mergedIntoId: true,
} as const;

type MergeableClient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  anonymizedAt: Date | null;
  mergedIntoId: string | null;
};

/**
 * Refuse une valeur retenue qui ne vient d'aucune des fiches fusionnées.
 *
 * Sans ce contrôle, la fusion serait un moyen d'écrire n'importe quoi dans une
 * fiche contact : c'est le seul chemin d'écriture sur les coordonnées d'un
 * client (il n'existe aucune action de modification), et une Server Action est
 * un endpoint HTTP appelable sans passer par la fenêtre. Un appelant pourrait
 * ainsi réattribuer l'adresse email d'un contact — donc détourner les réponses
 * d'un dossier vers une boîte de son choix.
 *
 * Le `null` de « téléphone » et « société » est traité comme une valeur : il
 * n'est accepté que si au moins une des fiches a effectivement ce champ vide.
 */
function refuseInventedValues(clients: readonly MergeableClient[], keep: ClientMergeSelection) {
  for (const field of MERGEABLE_FIELDS) {
    const offered = clients.some((client) => sameValue(client[field], keep[field]));
    if (!offered) {
      throw new ClientMergeError(
        `La valeur retenue pour « ${MERGEABLE_FIELD_LABELS[field]} » ne vient d'aucune des fiches fusionnées.`,
      );
    }
  }
}
// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

/**
 * Clé de `Ticket.metadata` retenant la fiche dont un ticket a été pris.
 *
 * Préfixée d'un souligné comme `_email` et `_papairis` : jamais confondue avec la
 * clé d'un champ personnalisé, qui est dérivée d'un libellé, et écartée du
 * différentiel d'audit par `changedMetadataKeys`.
 *
 * Écrite SEULEMENT si absente. C'est ce qui la rend fiable après plusieurs
 * fusions enchaînées : elle désigne toujours la fiche d'ORIGINE du ticket, et non
 * l'avant-dernière étape de son parcours. Détacher une fiche rend donc exactement
 * les tickets qui étaient à elle, quel que soit l'ordre des détachements.
 */
const MERGED_FROM_KEY = "_mergedFrom";

/** Note déposée sur un ticket dont l'adresse de réponse vient de changer. */
function addressChangeNote(actorName: string) {
  // Aucune adresse en clair : ni celle qui a été écartée, ni celle qui est
  // retenue. Un message de ticket n'est pas réécrit par une anonymisation
  // ultérieure — voir l'en-tête de ce fichier.
  return (
    `Fiches contacts fusionnées par ${actorName} : ce ticket est désormais rattaché au contact actif. ` +
    `Les réponses partiront à l'adresse de cette fiche, et non plus à celle d'origine — ` +
    `celle-ci reste lisible dans les en-têtes de l'email reçu.`
  );
}

/**
 * Fusionne les fiches `absorbedIds` dans `survivorId`.
 *
 * `survivorId` n'est pas un détail d'implémentation choisi par le serveur : c'est
 * la fiche dont l'ADRESSE reste celle du contact, et donc la réponse à la seule
 * question que la fenêtre pose vraiment. Voir `MERGEABLE_FIELDS`.
 *
 * `actorName` n'est pas décoratif non plus : la note déposée sur les tickets dont
 * l'adresse de réponse change est la seule trace qu'un agent voit en ouvrant ce
 * ticket, et c'est ce qu'un collègue cherchera le jour où la fusion sera
 * contestée.
 */
export async function mergeClients({
  survivorId,
  absorbedIds,
  keep,
  claimTicketIds = [],
  actorName,
}: {
  survivorId: string;
  absorbedIds: readonly string[];
  keep: ClientMergeSelection;
  /**
   * Tickets venus d'une des adresses en jeu mais rattachés ailleurs, que l'agent
   * a explicitement cochés pour les reprendre — voir `findReclaimableTickets`.
   * Jamais déduits ici : reprendre un ticket le retire à un AUTRE contact, ce qui
   * ne peut pas se faire sans que quelqu'un ait vu de qui il le retire.
   */
  claimTicketIds?: readonly string[];
  actorName: string;
}): Promise<ClientMergeOutcome> {
  const absorbed = [...new Set(absorbedIds)].filter((id) => id !== survivorId);

  if (absorbed.length === 0) {
    throw new ClientMergeError("Une fusion demande au moins deux fiches différentes.");
  }

  const ids = [survivorId, ...absorbed];
  const clients = await prisma.client.findMany({ where: { id: { in: ids } }, select: mergeSelect });

  if (clients.length !== ids.length) {
    throw new ClientMergeError(
      "L'une des fiches à fusionner n'existe plus. Rechargez le répertoire et recommencez.",
    );
  }

  // Une identité effacée ne se fusionne pas, dans un sens comme dans l'autre :
  // rattacher ses tickets à une identité vivante rendrait à la personne
  // anonymisée le « qui » qu'un droit à l'effacement lui avait retiré.
  if (clients.some((client) => client.anonymizedAt !== null)) {
    throw new ClientMergeError(
      "Une fiche dont l'identité a été effacée ne peut pas être fusionnée. Passez par Supervision → Données personnelles.",
    );
  }

  // Une fiche déjà rattachée à un autre contact n'est pas un contact : la
  // fusionner à nouveau la ferait changer de propriétaire dans le dos de celui
  // qui l'avait absorbée, et le détachement ne saurait plus à qui la rendre.
  // Refusé plutôt que résolu en silence — la fenêtre montre précisément quelles
  // fiches sont en jeu, elle ne doit pas en désigner d'autres.
  const alreadyMerged = clients.find((client) => client.mergedIntoId !== null);
  if (alreadyMerged) {
    throw new ClientMergeError(
      `La fiche « ${alreadyMerged.name} » est déjà rattachée à un autre contact. Détachez-la d'abord si elle n'est pas au bon endroit.`,
    );
  }

  refuseInventedValues(clients, keep);

  const survivor = clients.find((client) => client.id === survivorId);
  if (!survivor) {
    throw new ClientMergeError("La fiche à conserver n'existe plus.");
  }

  const replacedFields = MERGEABLE_FIELDS.filter(
    (field) => !sameValue(survivor[field], keep[field]),
  );

  const claimed = await claimableTickets({
    ticketIds: claimTicketIds,
    knownEmails: clients.map((client) => client.email),
    survivorId,
  });

  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    // Les tickets qui vont changer de fiche, relevés AVANT le déplacement :
    // après lui, ils pointent tous sur la fiche conservée et plus rien ne les
    // distingue de ceux qui y étaient déjà. Ce sont exactement ceux dont
    // l'adresse de réponse change — l'adresse de la fiche conservée, elle, ne
    // bouge pas (voir `MERGEABLE_FIELDS`), donc ses propres tickets ne sont pas
    // concernés.
    const moving = await tx.ticket.findMany({
      where: { clientId: { in: absorbed } },
      select: { id: true },
    });
    const warnedIds = [...new Set([...moving.map((ticket) => ticket.id), ...claimed])];

    // Deux instructions, et l'ordre compte. La première inscrit la provenance
    // sur les tickets qui n'en ont pas encore, en même temps qu'elle les
    // déplace ; la seconde ne déplace que les autres — ceux qui portent déjà la
    // fiche d'origine d'une fusion antérieure, qu'il ne faut pas écraser.
    //
    // Du SQL et non un `updateMany` : la valeur écrite dépend de la LIGNE (la
    // fiche à laquelle le ticket est rattaché à cet instant), ce qu'aucune
    // écriture en masse de Prisma ne sait exprimer. La reprise ligne par ligne,
    // elle, ferait autant d'allers-retours que le contact a de tickets.
    //
    // `-> 'clé' IS NULL` plutôt que l'opérateur `?` de jsonb : un point
    // d'interrogation dans une requête brute est ambigu selon le pilote.
    const movedWithOrigin = await tx.$executeRaw`
      UPDATE "tickets"
      SET "clientId" = ${survivorId},
          "metadata" = jsonb_set("metadata", ${`{${MERGED_FROM_KEY}}`}::text[], to_jsonb("clientId"), true)
      WHERE "clientId" IN (${Prisma.join(absorbed)})
        AND "metadata" -> ${MERGED_FROM_KEY} IS NULL
    `;
    const movedKeepingOrigin = await tx.ticket.updateMany({
      where: { clientId: { in: absorbed } },
      data: { clientId: survivorId },
    });

    // Les tickets repris à un tiers reçoivent la même provenance : sans elle, un
    // détachement ne saurait pas à qui les rendre, alors qu'ils viennent bien
    // d'ailleurs.
    const claimedCount =
      claimed.length > 0
        ? await tx.$executeRaw`
            UPDATE "tickets"
            SET "clientId" = ${survivorId},
                "metadata" = jsonb_set("metadata", ${`{${MERGED_FROM_KEY}}`}::text[], to_jsonb("clientId"), true)
            WHERE "id" IN (${Prisma.join(claimed)})
              AND "metadata" -> ${MERGED_FROM_KEY} IS NULL
          `
        : 0;

    // Les fiches absorbées ne sont ni vidées ni supprimées : elles sont
    // rattachées. C'est ce qui rend la fusion défaisable, et ce qui fait qu'un
    // email venu de leur adresse retrouve le contact actif.
    await tx.client.updateMany({
      where: { id: { in: absorbed } },
      data: { mergedIntoId: survivorId, mergedAt: now },
    });

    const updated = await tx.client.update({
      where: { id: survivorId },
      data: keep,
      select: { id: true, name: true },
    });

    if (warnedIds.length > 0) {
      await tx.message.createMany({
        data: warnedIds.map((ticketId) => ({
          ticketId,
          content: addressChangeNote(actorName),
          authorType: "SYSTEM" as const,
          isPrivate: true,
        })),
      });
    }

    return {
      survivorName: updated.name,
      movedTicketCount: movedWithOrigin + movedKeepingOrigin.count,
      claimedTicketCount: claimedCount,
      warnedTicketCount: warnedIds.length,
    };
  });

  return {
    survivorId,
    survivorName: outcome.survivorName,
    absorbedCount: absorbed.length,
    movedTicketCount: outcome.movedTicketCount,
    claimedTicketCount: outcome.claimedTicketCount,
    warnedTicketCount: outcome.warnedTicketCount,
    replacedFields,
  };
}

// ---------------------------------------------------------------------------
// Détachement
// ---------------------------------------------------------------------------

/**
 * Détache une fiche du contact qui l'avait absorbée.
 *
 * Possible précisément parce que la fusion n'a rien détruit. La fiche retrouve
 * son statut de contact autonome, et les tickets qui étaient à elle lui
 * reviennent — reconnus par `metadata._mergedFrom`, écrit au moment du
 * déplacement.
 *
 * Ce que le détachement NE rend PAS : les coordonnées arbitrées sur la fiche
 * conservée. Le nom, le téléphone ou la société repris d'une fiche absorbée
 * restent en place. Rien n'est perdu — chaque valeur d'origine est restée sur sa
 * propre fiche — mais l'ancienne valeur de la fiche conservée, elle, a bien été
 * remplacée. L'écran de confirmation le dit avant de laisser cliquer.
 *
 * Les fiches que celle-ci avait elle-même absorbées la suivent sans rien changer :
 * elles pointent toujours sur elle, elle redevient simplement leur contact actif.
 */
export async function unmergeClient({
  clientId,
  actorName,
}: {
  clientId: string;
  actorName: string;
}): Promise<ClientUnmergeOutcome> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      mergedInto: { select: { id: true, name: true } },
      _count: { select: { mergedClients: true } },
    },
  });

  if (!client) throw new ClientMergeError("Cette fiche n'existe plus.");
  if (!client.mergedInto) {
    throw new ClientMergeError("Cette fiche n'est rattachée à aucun autre contact.");
  }

  const previous = client.mergedInto;

  const restored = await prisma.$transaction(async (tx) => {
    // Les tickets pris à cette fiche, où qu'ils soient aujourd'hui : une fusion
    // enchaînée a pu les emmener plus loin, ils n'en restent pas moins les siens.
    // Relevés d'abord, parce que la note qui suit doit porter sur EXACTEMENT ces
    // tickets — après l'écriture, plus rien ne les distinguerait de ceux que la
    // fiche portait déjà.
    const mine = await tx.ticket.findMany({
      where: { metadata: { path: [MERGED_FROM_KEY], equals: clientId } },
      select: { id: true },
    });

    if (mine.length > 0) {
      // La provenance est effacée en même temps que le rattachement : la garder
      // ferait revenir ces tickets une seconde fois au prochain détachement.
      // Du SQL pour l'opérateur `-` de jsonb, que Prisma ne sait pas exprimer.
      await tx.$executeRaw`
        UPDATE "tickets"
        SET "clientId" = ${clientId},
            "metadata" = "metadata" - ${MERGED_FROM_KEY}
        WHERE "id" IN (${Prisma.join(mine.map((ticket) => ticket.id))})
      `;

      await tx.message.createMany({
        data: mine.map((ticket) => ({
          ticketId: ticket.id,
          content: `Fusion de fiches contacts annulée par ${actorName} : ce ticket est rendu à sa fiche d'origine. Les réponses repartiront à l'adresse de celle-ci.`,
          authorType: "SYSTEM" as const,
          isPrivate: true,
        })),
      });
    }

    await tx.client.update({
      where: { id: clientId },
      data: { mergedIntoId: null, mergedAt: null },
    });

    return mine.length;
  });

  return {
    clientId,
    clientName: client.name,
    previousName: previous.name,
    restoredTicketCount: restored,
    followingCount: client._count.mergedClients,
  };
}


/**
 * Combien de tickets la recherche rapporte au plus.
 *
 * Bornée parce que la requête ne peut PAS être indexée : l'adresse d'origine vit
 * dans `Ticket.metadata`, du JSON libre, et aucun index ne porte sur ce chemin —
 * chaque recherche parcourt la table des tickets. Bornée aussi parce qu'au-delà
 * d'une vingtaine de lignes, personne ne relit une liste dont chaque case cochée
 * retire un dossier à un autre contact. La troncature est annoncée à l'écran, pas
 * silencieuse.
 */
const MAX_RECLAIMABLE_TICKETS = 25;

/**
 * Les tickets nés d'un email venu d'une de ces adresses, et rattachés ailleurs.
 *
 * Déclenché par un bouton de la fenêtre de fusion, jamais à l'ouverture : la
 * recherche coûte un parcours de la table des tickets, elle doit être demandée.
 *
 * Les tickets des fiches en cours de fusion sont exclus — ils sont déplacés par la
 * fusion elle-même, les proposer en double n'apprendrait rien.
 */
export async function findReclaimableTickets({
  emails,
  mergedClientIds,
}: {
  emails: readonly string[];
  mergedClientIds: readonly string[];
}): Promise<ReclaimableSearch> {
  const addresses = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(Boolean);
  if (addresses.length === 0) return { tickets: [], truncated: false };

  const excluded = [...new Set(mergedClientIds)];

  const rows = await prisma.ticket.findMany({
    where: {
      AND: [
        // `metadata._email.from` est écrit en minuscules à la création (voir
        // `InboundEmailMetadata`), la comparaison est donc directe.
        {
          OR: addresses.map((email) => ({
            metadata: { path: [EMAIL_METADATA_KEY, "from"], equals: email },
          })),
        },
        // Les fiches en cours de fusion sont écartées ici et non après coup, pour
        // que la borne du `take` porte sur les lignes réellement proposées — sinon
        // la troncature s'annoncerait à faux. Le ticket SANS contact est gardé :
        // `notIn` seul l'écarterait (une comparaison à NULL n'est jamais vraie),
        // et c'est justement celui qu'il faut montrer sans le rendre reprenable.
        { OR: [{ clientId: null }, { clientId: { notIn: excluded } }] },
      ],
    },
    select: {
      id: true,
      number: true,
      subject: true,
      createdAt: true,
      metadata: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: { number: "desc" },
    take: MAX_RECLAIMABLE_TICKETS + 1,
  });

  const tickets = rows
    .slice(0, MAX_RECLAIMABLE_TICKETS)
    .map((row): ReclaimableTicket => ({
      id: row.id,
      number: row.number,
      subject: row.subject,
      createdAt: row.createdAt,
      originEmail: readInboundEmailMetadata(row.metadata)?.from ?? "",
      currentClient: row.client ? { id: row.client.id, name: row.client.name } : null,
      claimable: row.client !== null,
    }));

  return { tickets, truncated: rows.length > MAX_RECLAIMABLE_TICKETS };
}

/**
 * Filtre les tickets qu'un agent a cochés pour les reprendre, en ne gardant que
 * ceux qu'il est légitime de déplacer.
 *
 * Contrôle indispensable et pas un simple garde-fou : sans lui,
 * `mergeClientRecords` deviendrait « déplacer n'importe quel ticket vers
 * n'importe quel contact », depuis un endpoint HTTP, avec une permission de tenue
 * du répertoire. Trois conditions, toutes vérifiées côté serveur :
 *
 * — le ticket est né d'un email dont l'adresse est l'une de celles en jeu (c'est
 *   ce qui en fait un ticket « de cette personne ») ;
 * — il n'est pas déjà sur la fiche conservée (rien à faire) ;
 * — il est rattaché à QUELQU'UN. Un ticket sans contact est presque toujours
 *   l'orphelin d'une suppression au titre du droit à l'effacement : le rattacher
 *   à une identité vivante défairait cet effacement. Ceux-là sont montrés à
 *   l'agent, jamais déplacés.
 */
async function claimableTickets({
  ticketIds,
  knownEmails,
  survivorId,
}: {
  ticketIds: readonly string[];
  knownEmails: readonly string[];
  survivorId: string;
}): Promise<string[]> {
  const ids = [...new Set(ticketIds)];
  if (ids.length === 0) return [];

  const addresses = new Set(knownEmails.map((email) => email.trim().toLowerCase()));

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ids }, clientId: { not: null } },
    select: { id: true, clientId: true, metadata: true },
  });

  return tickets
    .filter((ticket) => ticket.clientId !== survivorId)
    .filter((ticket) => {
      const origin = readInboundEmailMetadata(ticket.metadata)?.from;
      return origin ? addresses.has(origin.trim().toLowerCase()) : false;
    })
    .map((ticket) => ticket.id);
}

/**
 * Ce que le journal d'audit retient de la fusion.
 *
 * Ne nomme que la fiche CONSERVÉE. L'identité des fiches absorbées n'y figure
 * pas : le journal est nettoyé d'une identité en cherchant le nom et l'email
 * courants de la personne visée (voir `pseudonymizeSubjectInJournal`), et une
 * identité recopiée ici mais rattachée à une AUTRE fiche échapperait à cette
 * recherche. Elle reste de toute façon lisible sur la fiche absorbée elle-même,
 * qui n'a pas disparu.
 */
export function describeClientMerge(outcome: ClientMergeOutcome, survivorEmail: string) {
  return [
    `${outcome.absorbedCount} fiche${plural(outcome.absorbedCount)} en doublon rattachée${plural(
      outcome.absorbedCount,
    )} au contact « ${outcome.survivorName} » (${survivorEmail}).`,
    `${outcome.movedTicketCount} ticket${plural(outcome.movedTicketCount)} déplacé${plural(
      outcome.movedTicketCount,
    )} vers ce contact.`,
    outcome.replacedFields.length > 0
      ? `Valeurs reprises d'une fiche absorbée : ${outcome.replacedFields
          .map((field) => MERGEABLE_FIELD_LABELS[field].toLowerCase())
          .join(", ")}.`
      : "Les coordonnées du contact conservé n'ont pas changé.",
    outcome.claimedTicketCount > 0
      ? `${outcome.claimedTicketCount} ticket${plural(
          outcome.claimedTicketCount,
        )} venu${plural(outcome.claimedTicketCount)} d'une de ces adresses ${
          outcome.claimedTicketCount > 1 ? "ont été repris" : "a été repris"
        } à un autre contact, sur décision de l'agent.`
      : "",
    outcome.warnedTicketCount > 0
      ? `${outcome.warnedTicketCount} ticket${plural(
          outcome.warnedTicketCount,
        )} change${outcome.warnedTicketCount > 1 ? "nt" : ""} d'adresse de réponse, et porte${plural(
          outcome.warnedTicketCount,
        )} une note interne qui le dit.`
      : "",
    "Fusion défaisable : les fiches absorbées sont conservées.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Ce que le journal retient du détachement. Même règle : la fiche détachée n'est pas nommée. */
export function describeClientUnmerge(outcome: ClientUnmergeOutcome) {
  return [
    `Fiche détachée du contact « ${outcome.previousName} » : elle redevient un contact autonome.`,
    `${outcome.restoredTicketCount} ticket${plural(
      outcome.restoredTicketCount,
    )} rendu${plural(outcome.restoredTicketCount)} à cette fiche.`,
    outcome.followingCount > 0
      ? `${outcome.followingCount} fiche${plural(
          outcome.followingCount,
        )} qu'elle avait elle-même absorbée${plural(outcome.followingCount)} la suit${
          outcome.followingCount > 1 ? "vent" : ""
        }.`
      : "",
    "Les coordonnées reprises par l'autre contact lors de la fusion ne sont pas restaurées.",
  ]
    .filter(Boolean)
    .join(" ");
}
