"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

/**
 * Présence des agents sur une fiche ticket.
 *
 * Un seul aller-retour par battement, volontairement : la fonction ANNONCE la
 * présence de l'appelant et RENVOIE celle des autres. Deux appels séparés
 * doubleraient le nombre de requêtes de chaque onglet ouvert, pour la même
 * information.
 *
 * Aucun `revalidatePath` ici, et c'est important : la présence change toutes les
 * quinze secondes, la revalidation rejouerait tout le rendu serveur de la fiche
 * (fil, pièces jointes, doublons) à cette cadence. Le résultat est renvoyé au
 * composant, qui met à jour la seule bande concernée.
 */

/**
 * Durée au-delà de laquelle une présence n'est plus tenue pour vraie.
 *
 * Trois fois le battement du client : un onglet qui saute un tour (requête lente,
 * machine en veille brève) ne doit pas faire clignoter l'indicateur chez ses
 * collègues. Trop long, à l'inverse, et on avertirait d'une collision avec
 * quelqu'un qui a fermé son onglet depuis une minute — un avertissement qu'on
 * apprend vite à ignorer.
 */
const PRESENCE_TTL_MS = 45_000;

const heartbeatSchema = z.object({
  ticketId: z.string().min(1),
  /** Le champ de réponse de l'appelant n'est pas vide. */
  composing: z.boolean(),
});

export type TicketPresenceItem = {
  agentId: string;
  name: string;
  /** Il a un brouillon en cours dans son champ de réponse. */
  composing: boolean;
};

/**
 * Annonce la présence de l'agent courant sur ce ticket, et renvoie celle des
 * autres.
 *
 * L'auteur vient de la session, jamais d'un paramètre : une présence dont
 * l'appelant choisit le nom permettrait de faire croire à un collègue qu'un
 * troisième agent travaille le dossier.
 */
export async function heartbeatTicketPresence(
  input: z.infer<typeof heartbeatSchema>,
): Promise<TicketPresenceItem[]> {
  // « tickets.view » et non « tickets.respond » : un agent en lecture seule est
  // présent sur la fiche lui aussi, et ses collègues gagnent à le savoir.
  const session = await requirePermission("tickets.view");
  const { ticketId, composing } = heartbeatSchema.parse(input);

  const agentId = session.user.id;
  if (!agentId) return [];

  const now = new Date();
  const freshSince = new Date(now.getTime() - PRESENCE_TTL_MS);

  await prisma.ticketPresence.upsert({
    where: { ticketId_agentId: { ticketId, agentId } },
    create: { ticketId, agentId, seenAt: now, composingAt: composing ? now : null },
    // `composingAt` remis à nul quand le champ se vide : c'est le battement qui
    // retire l'alerte chez le collègue, sans attendre l'expiration.
    update: { seenAt: now, composingAt: composing ? now : null },
  });

  // Ménage au passage, toutes fiches confondues plutôt que sur ce seul ticket :
  // une ligne laissée par un onglet fermé sur un dossier que personne ne rouvre
  // resterait sinon en base indéfiniment — c'est-à-dire une donnée sur ce qu'un
  // agent consultait, conservée sans raison ni limite.
  await prisma.ticketPresence.deleteMany({ where: { seenAt: { lt: freshSince } } });

  const others = await prisma.ticketPresence.findMany({
    where: { ticketId, agentId: { not: agentId }, seenAt: { gte: freshSince } },
    select: { agentId: true, composingAt: true, agent: { select: { name: true } } },
    // Le plus récemment vu d'abord : quand plusieurs collègues sont là, c'est
    // celui qui vient d'agir qui compte le plus.
    orderBy: { seenAt: "desc" },
  });

  return others.map((presence) => ({
    agentId: presence.agentId,
    name: presence.agent.name,
    // Testé sur la fraîcheur et pas seulement sur la présence de la valeur : un
    // onglet fermé au milieu d'un brouillon laisse `composingAt` renseigné, et
    // annoncer « il rédige » quinze secondes après sa fermeture serait faux.
    composing: presence.composingAt !== null && presence.composingAt >= freshSince,
  }));
}

/**
 * Retire la présence de l'agent courant.
 *
 * Appelé quand il quitte la fiche. Best-effort par nature — une fermeture
 * d'onglet ou une coupure réseau n'appellera rien du tout — c'est pourquoi
 * l'expiration ci-dessus reste la vraie garantie, et non ce nettoyage explicite.
 * Il ne sert qu'à faire disparaître l'indicateur tout de suite au lieu d'attendre
 * quarante-cinq secondes.
 */
export async function clearTicketPresence(ticketId: string) {
  const session = await requirePermission("tickets.view");
  const agentId = session.user.id;
  if (!agentId) return;

  await prisma.ticketPresence.deleteMany({
    where: { ticketId: z.string().min(1).parse(ticketId), agentId },
  });
}
