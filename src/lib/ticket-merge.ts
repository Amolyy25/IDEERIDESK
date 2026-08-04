import { prisma } from "@/lib/prisma";

/**
 * Fusion de deux tickets qui traitent de la même demande.
 *
 * Modèle retenu : le ticket source n'est ni vidé ni supprimé. Il est clos,
 * rattaché à la cible (`mergedIntoId`) et cesse d'être un dossier à traiter ;
 * son fil, son numéro et surtout son fil Gmail restent intacts. C'est ce dernier
 * point qui commande tout le reste : chaque ticket porte la conversation d'UN
 * client, et deux personnes qui ont signalé la même panne doivent recevoir la
 * réponse chacune dans leur propre échange. Déplacer les messages vers la cible
 * casserait ce lien, rendrait la fusion irréversible, et n'apporterait rien —
 * l'agent voit déjà tout depuis la cible (voir `mergedTickets` dans la fiche).
 *
 * L'équipe travaille donc à un seul endroit, le client n'en sait rien, et
 * défusionner reste possible.
 */

/** Profondeur maximale suivie en remontant une chaîne de fusions. Garde-fou anti-cycle. */
const MAX_MERGE_DEPTH = 20;

export class TicketMergeError extends Error {}

/**
 * Remonte jusqu'au ticket réellement actif d'une chaîne de fusions.
 *
 * Un agent qui fusionne A dans B, alors que B a déjà été fusionné dans C, veut
 * dire « A rejoint le dossier de référence » : le lui refuser serait une leçon
 * de plomberie interne. On résout donc silencieusement vers C. La borne de
 * profondeur protège d'un cycle qu'une écriture concurrente aurait pu créer.
 */
export async function resolveMergeRoot(ticketId: string): Promise<string> {
  let currentId = ticketId;

  for (let depth = 0; depth < MAX_MERGE_DEPTH; depth += 1) {
    const current = await prisma.ticket.findUnique({
      where: { id: currentId },
      select: { mergedIntoId: true },
    });
    if (!current?.mergedIntoId) return currentId;
    currentId = current.mergedIntoId;
  }

  throw new TicketMergeError(
    "Chaîne de fusion anormalement longue : vérifiez ces tickets avant de continuer."
  );
}

export type MergeOutcome = {
  sourceNumber: number;
  targetId: string;
  targetNumber: number;
  /** Doublons que le source avait lui-même absorbés, transférés à la cible. */
  reattachedCount: number;
};

/**
 * Fusionne `sourceId` dans `targetId`.
 *
 * `actorName` n'est pas décoratif : les notes déposées de part et d'autre sont
 * la seule trace de qui a décidé du rapprochement, et c'est ce qu'un collègue
 * cherchera le jour où la fusion sera contestée.
 */
export async function mergeTickets({
  sourceId,
  targetId,
  actorName,
}: {
  sourceId: string;
  targetId: string;
  actorName: string;
}): Promise<MergeOutcome> {
  const resolvedTargetId = await resolveMergeRoot(targetId);

  if (sourceId === resolvedTargetId) {
    throw new TicketMergeError("Un ticket ne peut pas être fusionné avec lui-même.");
  }

  const [source, target] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        number: true,
        subject: true,
        mergedIntoId: true,
        client: { select: { name: true } },
      },
    }),
    prisma.ticket.findUnique({
      where: { id: resolvedTargetId },
      select: { id: true, number: true, subject: true },
    }),
  ]);

  if (!source) throw new TicketMergeError("Ticket à fusionner introuvable.");
  if (!target) throw new TicketMergeError("Ticket de destination introuvable.");
  if (source.mergedIntoId) {
    throw new TicketMergeError(`Le ticket #${source.number} est déjà fusionné dans un autre ticket.`);
  }

  // Pas de cycle possible à partir d'ici, et les deux contrôles ci-dessus
  // suffisent à le garantir : la cible est une racine (c'est ce que
  // `resolveMergeRoot` vient de produire, donc son `mergedIntoId` est nul) et le
  // source n'est rattaché à rien. Aucune chaîne ne part de la cible, elle ne
  // peut donc pas redescendre vers le source. Reste le cas de deux agents
  // fusionnant A→B et B→A au même instant : la borne de profondeur de
  // `resolveMergeRoot` transforme alors la boucle en erreur lisible plutôt qu'en
  // requête sans fin.

  // Statut de clôture facultatif, comme partout ailleurs (voir `closeTicket`) :
  // sans statut marqué dans les réglages, le ticket est rattaché quand même —
  // perdre le rapprochement parce qu'un réglage manque serait le pire échange.
  const closeStatus = await prisma.ticketStatus.findFirst({ where: { isCloseDefault: true } });

  const clientLabel = source.client?.name ?? "sans client rattaché";
  const now = new Date();

  const { reattachedCount } = await prisma.$transaction(async (tx) => {
    // Les doublons déjà absorbés par le source suivent le mouvement, sinon ils
    // resteraient accrochés à un ticket qui n'est plus le dossier de travail —
    // et leurs clients ne recevraient plus les réponses.
    const reattached = await tx.ticket.updateMany({
      where: { mergedIntoId: sourceId },
      data: { mergedIntoId: target.id },
    });

    await tx.ticket.update({
      where: { id: sourceId },
      data: {
        mergedIntoId: target.id,
        mergedAt: now,
        closedAt: now,
        hasUnreadActivity: false,
        ...(closeStatus ? { statusId: closeStatus.id } : {}),
      },
    });

    await tx.message.create({
      data: {
        ticketId: sourceId,
        content: `Ticket fusionné dans le ticket #${target.number} par ${actorName}. Le suivi et les réponses se font désormais depuis ce ticket.`,
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });

    await tx.message.create({
      data: {
        ticketId: target.id,
        content: `Ticket #${source.number} (${clientLabel}) fusionné dans celui-ci par ${actorName} : « ${source.subject} ». Les réponses publiques envoyées ici partiront aussi à son client.`,
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });

    // Le rapprochement qui a mené à cette fusion, dans un sens comme dans
    // l'autre : une fois la fusion faite, il n'a plus à être proposé.
    await tx.ticketDuplicateSuggestion.updateMany({
      where: {
        status: "PENDING",
        OR: [
          { ticketId: sourceId, candidateId: target.id },
          { ticketId: target.id, candidateId: sourceId },
        ],
      },
      data: { status: "MERGED", decidedAt: now },
    });

    // La cible remonte dans les vues : elle vient d'absorber une demande, et
    // c'est là que l'agent doit revenir.
    await tx.ticket.update({ where: { id: target.id }, data: { updatedAt: now } });

    return { reattachedCount: reattached.count };
  });

  return {
    sourceNumber: source.number,
    targetId: target.id,
    targetNumber: target.number,
    reattachedCount,
  };
}

/**
 * Détache un ticket de celui dans lequel il avait été fusionné.
 *
 * Possible précisément parce que la fusion n'a rien détruit. Le ticket est
 * rouvert vers le statut de réouverture (le même que pour un client qui reprend
 * la parole après une clôture) : le laisser fermé reviendrait à défusionner un
 * dossier que personne ne reverrait.
 */
export async function unmergeTicket({
  ticketId,
  actorName,
}: {
  ticketId: string;
  actorName: string;
}): Promise<{ number: number; previousNumber: number }> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      number: true,
      mergedInto: { select: { id: true, number: true } },
    },
  });

  if (!ticket) throw new TicketMergeError("Ticket introuvable.");
  if (!ticket.mergedInto) throw new TicketMergeError("Ce ticket n'est pas fusionné.");

  const reopenStatus =
    (await prisma.ticketStatus.findFirst({ where: { isReopenDefault: true, isClosed: false } })) ??
    (await prisma.ticketStatus.findFirst({
      where: { isDefault: true, isClosed: false },
      orderBy: { order: "asc" },
    }));

  const previous = ticket.mergedInto;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        mergedIntoId: null,
        mergedAt: null,
        closedAt: null,
        ...(reopenStatus ? { statusId: reopenStatus.id } : {}),
      },
    });

    await tx.message.create({
      data: {
        ticketId,
        content: `Fusion avec le ticket #${previous.number} annulée par ${actorName} : ce ticket redevient un dossier à part entière.`,
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });

    await tx.message.create({
      data: {
        ticketId: previous.id,
        content: `Le ticket #${ticket.number} a été détaché de celui-ci par ${actorName}.`,
        authorType: "SYSTEM",
        isPrivate: true,
      },
    });
  });

  return { number: ticket.number, previousNumber: previous.number };
}

export type MergedRecipient = {
  ticketId: string;
  ticketNumber: number;
  clientEmail: string;
  /** Sert à étiqueter ses propres messages dans l'historique repris en bas de l'email. */
  clientName: string;
  gmailThreadId: string | null;
  emailMessageId: string | null;
  subject: string;
};

/**
 * Clients des tickets fusionnés dans celui-ci, à qui la réponse doit partir
 * elle aussi — c'est le bénéfice concret de la fusion : une réponse écrite une
 * fois, reçue par tous ceux qui attendaient.
 *
 * Chacun reçoit un email distinct, dans sa propre conversation. Jamais de Cc
 * commun : mettre en copie deux clients d'agences différentes leur exposerait
 * mutuellement leur adresse, ce qu'aucun d'eux n'a accepté en écrivant au
 * support.
 *
 * `excludeEmails` porte les adresses déjà servies (celle du ticket cible en
 * premier lieu) : quand la même personne a ouvert deux tickets — le doublon
 * accidentel — elle ne doit pas recevoir deux fois le même message.
 */
export async function getMergedRecipients(
  targetTicketId: string,
  excludeEmails: string[] = []
): Promise<MergedRecipient[]> {
  const merged = await prisma.ticket.findMany({
    where: { mergedIntoId: targetTicketId },
    select: {
      id: true,
      number: true,
      subject: true,
      gmailThreadId: true,
      emailMessageId: true,
      client: { select: { name: true, email: true } },
    },
    orderBy: { number: "asc" },
  });

  const seen = new Set(excludeEmails.map((email) => email.toLowerCase()));
  const recipients: MergedRecipient[] = [];

  for (const ticket of merged) {
    const client = ticket.client;
    if (!client?.email) continue;

    const key = client.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    recipients.push({
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      clientEmail: client.email,
      clientName: client.name,
      gmailThreadId: ticket.gmailThreadId,
      emailMessageId: ticket.emailMessageId,
      subject: ticket.subject,
    });
  }

  return recipients;
}
