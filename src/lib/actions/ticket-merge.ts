"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCanRespond } from "@/lib/require-permission";
import { rateLimit } from "@/lib/rate-limit";
import {
  mergeTickets,
  unmergeTicket,
  TicketMergeError,
  type MergeOutcome,
} from "@/lib/ticket-merge";
import {
  getPendingDuplicateSuggestions,
  scanTicketForDuplicates,
  type DuplicateScanResult,
  type DuplicateSuggestion,
} from "@/lib/ticket-duplicates";
import { recordAudit } from "@/lib/audit";

/** Ce que le journal d'audit retient d'un ticket : son numéro et son sujet. */
function auditRef(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, number: true, subject: true },
  });
}

/**
 * Fusion de doublons : recherche des rapprochements, fusion, défusion.
 *
 * Toutes les actions exigent `canRespond` — fusionner ferme un dossier, change
 * ce que le client recevra et modifie le fil de deux tickets : ce n'est pas un
 * geste de consultation.
 */

/**
 * Détections IA par agent et par heure. Chaque passage est facturé au jeton, et
 * la bannière de la fiche déclenche l'appel toute seule : sans plafond, un
 * agent qui ouvre trente tickets à la suite déclenche trente appels.
 */
const SCANS_PER_HOUR = 40;

const MAX_SEARCH_RESULTS = 12;

export async function getDuplicateSuggestions(ticketId: string): Promise<DuplicateSuggestion[]> {
  await requireCanRespond();
  return getPendingDuplicateSuggestions(ticketId);
}

/**
 * Lance (ou relit) la détection de doublons pour un ticket.
 *
 * Appelée automatiquement à l'ouverture de la fiche, et à la demande depuis le
 * bouton « Rechercher des doublons » (`force`). Le cache en base et le
 * pré-filtre lexical font que l'immense majorité des appels ne touchent jamais
 * le fournisseur d'IA — voir `scanTicketForDuplicates`.
 */
export async function detectTicketDuplicates(
  ticketId: string,
  options: { force?: boolean } = {}
): Promise<DuplicateScanResult> {
  const session = await requireCanRespond();

  const limit = rateLimit(`duplicate-scan:${session.user.id}`, SCANS_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return {
      suggestions: await getPendingDuplicateSuggestions(ticketId),
      skippedReason: "Trop de recherches de doublons. Réessayez dans quelques minutes.",
    };
  }

  return scanTicketForDuplicates(ticketId, { force: options.force ?? false });
}

export async function dismissDuplicateSuggestion(suggestionId: string) {
  await requireCanRespond();

  const suggestion = await prisma.ticketDuplicateSuggestion.findUnique({
    where: { id: suggestionId },
    select: { ticketId: true, candidateId: true },
  });
  if (!suggestion) return;

  await prisma.ticketDuplicateSuggestion.update({
    where: { id: suggestionId },
    data: { status: "DISMISSED", decidedAt: new Date() },
  });

  // Les deux fiches : un rapprochement se voit depuis le ticket récent comme
  // depuis le dossier de référence (voir `getPendingDuplicateSuggestions`), il
  // doit donc disparaître des deux quand un agent l'écarte.
  revalidatePath(`/tickets/${suggestion.ticketId}`);
  revalidatePath(`/tickets/${suggestion.candidateId}`);
}

const mergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export async function mergeTicketInto(input: z.infer<typeof mergeSchema>): Promise<MergeOutcome> {
  const session = await requireCanRespond();
  const data = mergeSchema.parse(input);

  const actorName = session.user.name || session.user.email || "un agent";

  try {
    const outcome = await mergeTickets({ ...data, actorName });

    // Tracé sur le ticket ABSORBÉ : c'est celui dont l'équipe cessera de
    // s'occuper, donc celui qu'on cherchera dans le journal en se demandant
    // « pourquoi ce dossier ne bouge plus ? ». Le numéro de la cible est dans le
    // libellé, ce qui rend la ligne lisible sans ouvrir les deux fiches.
    await recordAudit({
      session,
      action: "TICKET_MERGED",
      ticket: await auditRef(data.sourceId),
      summary: [
        `Fusionné dans le ticket #${outcome.targetNumber}, qui devient le dossier de référence.`,
        outcome.reattachedCount > 0
          ? `${outcome.reattachedCount} doublon${
              outcome.reattachedCount > 1 ? "s" : ""
            } qu'il avait absorbé${outcome.reattachedCount > 1 ? "s" : ""} y ${
              outcome.reattachedCount > 1 ? "ont" : "a"
            } été rattaché${outcome.reattachedCount > 1 ? "s" : ""}.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    });

    revalidatePath(`/tickets/${data.sourceId}`);
    revalidatePath(`/tickets/${outcome.targetId}`);
    revalidatePath("/tickets");
    return outcome;
  } catch (error) {
    // Les refus de fusion sont des messages écrits pour l'agent (« déjà
    // fusionné », « ces deux tickets sont liés ») : ils remontent tels quels,
    // au lieu d'être aplatis en erreur générique.
    if (error instanceof TicketMergeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function separateMergedTicket(ticketId: string) {
  const session = await requireCanRespond();
  const actorName = session.user.name || session.user.email || "un agent";

  try {
    const result = await unmergeTicket({ ticketId, actorName });

    await recordAudit({
      session,
      action: "TICKET_UNMERGED",
      ticket: await auditRef(ticketId),
      summary: `Détaché du ticket #${result.previousNumber} : il redevient un dossier autonome.`,
    });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/tickets");
    return result;
  } catch (error) {
    if (error instanceof TicketMergeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export type MergeSearchResult = {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  clientName: string | null;
  statusName: string;
  isClosed: boolean;
};

/**
 * Tickets proposés dans le dialogue de fusion manuelle.
 *
 * Sans terme de recherche, les plus récents : c'est presque toujours parmi eux
 * que se trouve le doublon qu'un agent vient de repérer à l'œil. Les tickets
 * déjà fusionnés ailleurs sont exclus — les choisir comme destination
 * renverrait vers un dossier que l'équipe ne suit plus.
 */
export async function searchTicketsToMergeInto(
  ticketId: string,
  search: string
): Promise<MergeSearchResult[]> {
  await requireCanRespond();

  const term = search.trim();
  const searchedNumber = term ? Number(term.replace(/^#/, "")) : Number.NaN;
  const numberMatch =
    Number.isInteger(searchedNumber) && searchedNumber > 0 ? [{ number: searchedNumber }] : [];

  const tickets = await prisma.ticket.findMany({
    where: {
      id: { not: ticketId },
      mergedIntoId: null,
      ...(term
        ? {
            OR: [
              ...numberMatch,
              { subject: { contains: term, mode: "insensitive" } },
              { description: { contains: term, mode: "insensitive" } },
              { client: { name: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      number: true,
      subject: true,
      createdAt: true,
      client: { select: { name: true } },
      status: { select: { name: true, isClosed: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_SEARCH_RESULTS,
  });

  return tickets.map((ticket) => ({
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    createdAt: ticket.createdAt,
    clientName: ticket.client?.name ?? null,
    statusName: ticket.status.name,
    isClosed: ticket.status.isClosed,
  }));
}
