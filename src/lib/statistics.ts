import { prisma } from "@/lib/prisma";
import type { Prisma, TicketSource } from "@/generated/prisma/client";
import { breachedSlaWhere } from "@/lib/sla";
import { ticketSourceLabels } from "@/lib/ticket-source";
import { bucketKey, buildStatsBuckets, type StatsRange } from "@/lib/stats-range";

/**
 * Le calcul des statistiques : ce qui est compté, sur quelle population, et
 * comment.
 *
 * Module sans `"use server"` — les gardes vivent dans
 * `@/lib/actions/statistics`, qui est le seul appelant. Le découpage suit celui
 * du journal d'audit (`audit-query.ts` / `actions/audit-log.ts`) : la logique de
 * lecture d'un côté, la frontière d'accès de l'autre.
 *
 * DEUX PARTIS PRIS À CONNAÎTRE AVANT DE LIRE LES CHIFFRES.
 *
 * 1. Chaque mesure dit sur QUELLE population elle porte, et ce n'est pas la même
 *    partout. Les volumes et les répartitions portent sur les tickets ARRIVÉS
 *    dans la période (c'est la charge reçue). Les délais, eux, portent sur le
 *    travail FAIT dans la période : le délai de première réponse est mesuré sur
 *    les tickets dont la première réponse est partie pendant la période, le délai
 *    de résolution sur ceux qui ont été clos pendant la période. Mesurer les
 *    délais sur la cohorte d'arrivée donnerait un chiffre systématiquement
 *    flatteur en fin de période : les tickets d'hier soir, encore sans réponse,
 *    n'y comptent pas, et ceux arrivés la veille de la clôture d'un mois
 *    n'auraient jamais eu le temps d'être en retard.
 *
 * 2. Les instantanés (« en attente en ce moment », « en retard », « non
 *    assignés ») ne dépendent PAS de la période choisie et ne sont pas comparés
 *    à la période précédente : ils décrivent l'état de la file à l'instant du
 *    chargement. Les mélanger aux mesures de période était le piège principal de
 *    cet écran — « 12 tickets en attente » sur mars 2024 ne veut rien dire, la
 *    file d'alors n'existe plus.
 *
 * Une conséquence à garder en tête sur une période EN COURS (« aujourd'hui »,
 * « mois en cours ») : les mesures portées par la cohorte d'arrivée — le nombre de
 * tickets ayant reçu une réponse, et donc le taux de réponse — sont mécaniquement
 * plus basses qu'en fin de période, puisque les demandes des dernières heures
 * n'ont pas encore eu le temps d'être traitées. C'est pour cette raison que
 * « toujours sans réponse » ne porte aucun écart avec la période précédente : la
 * comparaison opposerait une cohorte de quelques heures à une cohorte mûre, et
 * conclurait toujours à une dégradation.
 *
 * Tout se calcule en mémoire à partir de quelques lectures larges plutôt qu'en
 * multipliant les agrégats SQL : la même liste de tickets sert aux volumes, aux
 * répartitions, aux délais, au classement des clients et à la carte d'activité.
 * Un agrégat par mesure aurait imposé une quinzaine d'allers-retours dont les
 * filtres auraient fini par diverger.
 */

/**
 * Plafond de lecture, par population. Au-delà, la page le DIT (voir
 * `truncated`) : un plafond silencieux ferait passer un extrait pour un total,
 * ce qui est pire qu'une page lente. En pratique jamais atteint — c'est un
 * garde-fou contre une plage personnalisée de plusieurs années.
 */
export const STATS_ROW_CAP = 20_000;

const DAY_MS = 86_400_000;

export type StatsFilters = {
  /** Produit concerné (TicketCategory). `null` = tous les produits. */
  categoryId?: string | null;
};

// ---------------------------------------------------------------------------
// Formes rendues à l'écran
// ---------------------------------------------------------------------------

export type MetricDelta = {
  current: number;
  previous: number;
  /** Écart relatif en %, `null` quand la période précédente est à zéro. */
  changePercent: number | null;
};

export type DurationSummary = {
  /** Nombre de tickets sur lesquels le délai a pu être mesuré. */
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  /** Neuf tickets sur dix ont été traités en moins de ce délai. */
  p90Ms: number | null;
};

export type SlaOutcome = {
  /** Tickets portant un engagement de ce type sur la période. */
  committed: number;
  met: number;
  missed: number;
};

export type BreakdownRow = {
  id: string;
  label: string;
  /** Couleur configurée de la valeur, affichée en pastille — jamais en remplissage. */
  color: string | null;
  count: number;
  /** Part du total de la répartition, de 0 à 1. */
  share: number;
};

export type TimelinePoint = {
  key: string;
  label: string;
  tick: string;
  created: number;
  closed: number;
};

export type ActivityHeatmap = {
  /** 7 lignes (lundi → dimanche) de 24 colonnes. */
  matrix: number[][];
  max: number;
  total: number;
  peak: { weekday: number; hour: number; count: number } | null;
};

export type AgentStatRow = {
  id: string;
  name: string;
  /** Tickets distincts auxquels l'agent a répondu publiquement dans la période. */
  handledTickets: number;
  /** Parmi eux, ceux qui lui étaient assignés. */
  handledAssignedToThem: number;
  /** Parmi eux, ceux relevant d'un produit couvert par ses groupes. */
  handledOnOwnScope: number;
  publicReplies: number;
  internalNotes: number;
  /** Tickets dont il a signé la PREMIÈRE réponse au client. */
  firstResponses: number;
  /** Délai médian de ces premières réponses. */
  medianFirstResponseMs: number | null;
  /** Tickets qui lui étaient assignés et qui ont été clos dans la période. */
  closedAssigned: number;
  /** Instantané : tickets ouverts actuellement sur son nom. */
  openAssignedNow: number;
};

export type ClientStatRow = {
  id: string;
  name: string;
  company: string | null;
  /** Fiche dont l'identité a été effacée (RGPD) : le nom affiché est un pseudonyme. */
  anonymized: boolean;
  tickets: number;
  closed: number;
  awaitingReply: number;
  lastTicketAt: Date;
};

export type QueueTicketRow = {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  priorityName: string;
  priorityColor: string;
  statusName: string;
};

export type StatsReport = {
  /** Une des populations lues a atteint `STATS_ROW_CAP`. */
  truncated: boolean;

  volume: {
    created: MetricDelta;
    answered: MetricDelta;
    closed: MetricDelta;
    /**
     * Arrivés dans la période et toujours sans réponse d'agent aujourd'hui.
     * Sans écart, volontairement : voir le biais de cohorte en tête de module.
     */
    stillAwaitingReply: number;
    /** Arrivés dans la période puis rattachés à un autre dossier (doublons). */
    mergedAsDuplicate: number;
    /** Part des tickets arrivés qui ont reçu une réponse, de 0 à 1. */
    answerRate: number | null;
  };

  /** État de la file à l'instant du chargement — hors période. */
  now: {
    open: number;
    awaitingReply: number;
    unassigned: number;
    breached: number;
    slaPaused: number;
    totalEverCreated: number;
  };

  durations: {
    firstResponse: DurationSummary;
    resolution: DurationSummary;
    previousMedianFirstResponseMs: number | null;
    previousMedianResolutionMs: number | null;
  };

  sla: {
    firstResponse: SlaOutcome;
    resolution: SlaOutcome;
  };

  timeline: TimelinePoint[];
  heatmap: ActivityHeatmap;

  breakdowns: {
    statuses: BreakdownRow[];
    priorities: BreakdownRow[];
    products: BreakdownRow[];
    channels: BreakdownRow[];
  };

  agents: AgentStatRow[];
  clients: ClientStatRow[];
  /** Nombre de contacts distincts ayant déposé au moins un ticket dans la période. */
  distinctClients: number;

  unassigned: {
    /** Instantané : tickets ouverts que personne n'a pris en charge. */
    count: number;
    oldest: QueueTicketRow[];
  };
};

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * « Avoir répondu au client », partout sur cette page : un message d'agent
 * PUBLIC. Ni une note interne, ni l'accusé de réception automatique (qui n'est
 * pas signé par un agent).
 */
const PUBLIC_AGENT_REPLY = { authorType: "AGENT", isPrivate: false } as const;

/**
 * Première réponse publique du ticket, jointe à chaque ligne lue.
 *
 * C'EST LA SOURCE DE VÉRITÉ, et non la colonne `Ticket.firstRespondedAt`. Cette
 * colonne n'existe que depuis la mise en service du SLA (migration
 * `20260811120000_ticket_sla`) et n'a délibérément pas été appliquée
 * rétroactivement : les tickets antérieurs l'ont à `null` même quand l'équipe y a
 * répondu. S'y fier ferait compter tout l'historique comme « jamais répondu » —
 * sur la base de production au moment de l'écriture, 44 tickets répondus sur 55.
 *
 * Le fil de messages, lui, dit la vérité depuis le premier jour. Le surcoût est
 * une jointure latérale à une ligne, sur une colonne déjà indexée
 * (`messages.ticketId`).
 */
const firstReplySelect = {
  where: PUBLIC_AGENT_REPLY,
  orderBy: { createdAt: "asc" },
  take: 1,
  select: { createdAt: true },
} satisfies Prisma.Ticket$messagesArgs;

const createdSelect = {
  createdAt: true,
  closedAt: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  statusId: true,
  priorityId: true,
  categoryId: true,
  formSourceId: true,
  source: true,
  assigneeId: true,
  clientId: true,
  mergedIntoId: true,
  messages: firstReplySelect,
} satisfies Prisma.TicketSelect;

type CreatedTicket = Prisma.TicketGetPayload<{ select: typeof createdSelect }>;

/** Ligne de travail : les deux horloges du ticket, aplaties. */
type WorkRow = {
  id: string;
  createdAt: Date;
  /** Première réponse publique, lue dans le fil. */
  firstReplyAt: Date | null;
  firstResponseDueAt: Date | null;
  closedAt: Date | null;
  resolutionDueAt: Date | null;
};

/** Arrivée dans la période, avec sa première réponse déjà aplatie. */
type CreatedRow = Omit<CreatedTicket, "messages"> & { firstReplyAt: Date | null };

/** Ce qu'une période fournit : les arrivées, les premières réponses, les clôtures. */
type PeriodRows = {
  created: CreatedRow[];
  /** Tickets dont la PREMIÈRE réponse publique est partie pendant la période. */
  responded: WorkRow[];
  closed: WorkRow[];
  truncated: boolean;
};

const workSelect = {
  id: true,
  createdAt: true,
  firstResponseDueAt: true,
  closedAt: true,
  resolutionDueAt: true,
  messages: firstReplySelect,
} satisfies Prisma.TicketSelect;

type WorkTicket = Prisma.TicketGetPayload<{ select: typeof workSelect }>;

function flatten(ticket: WorkTicket): WorkRow {
  return {
    id: ticket.id,
    createdAt: ticket.createdAt,
    firstReplyAt: ticket.messages[0]?.createdAt ?? null,
    firstResponseDueAt: ticket.firstResponseDueAt,
    closedAt: ticket.closedAt,
    resolutionDueAt: ticket.resolutionDueAt,
  };
}

/**
 * Ancienneté maximale d'un ticket dont on cherche la première réponse dans la
 * période.
 *
 * Une borne est nécessaire : « les tickets dont la première réponse tombe dans la
 * période » ne se demande pas en SQL sans passer par le minimum des messages de
 * CHAQUE ticket jamais répondu, ce qui grossirait indéfiniment. Un an couvre très
 * largement le délai réel de première réponse ; un dossier resté sans un mot
 * pendant plus d'un an et répondu aujourd'hui échappera au calcul des délais —
 * il reste compté dans les volumes, qui ne dépendent pas de cette borne.
 */
const FIRST_REPLY_LOOKBACK_DAYS = 365;

function categoryWhere(filters: StatsFilters): Prisma.TicketWhereInput {
  return filters.categoryId ? { categoryId: filters.categoryId } : {};
}

async function loadPeriod(from: Date, to: Date, filters: StatsFilters): Promise<PeriodRows> {
  const scope = categoryWhere(filters);
  const window = { gte: from, lte: to };
  const lookbackStart = new Date(from.getTime() - FIRST_REPLY_LOOKBACK_DAYS * DAY_MS);

  const [created, replyCandidates, closed] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...scope, createdAt: window },
      select: createdSelect,
      // Les plus récents d'abord : si le plafond mord, ce qui manque est le plus
      // ancien, c'est-à-dire le moins probable d'intéresser qui consulte.
      orderBy: { createdAt: "desc" },
      take: STATS_ROW_CAP,
    }),
    prisma.ticket.findMany({
      where: {
        ...scope,
        createdAt: { gte: lookbackStart, lte: to },
        messages: { some: { ...PUBLIC_AGENT_REPLY, createdAt: { lte: to } } },
      },
      select: workSelect,
      orderBy: { createdAt: "desc" },
      take: STATS_ROW_CAP,
    }),
    prisma.ticket.findMany({
      where: { ...scope, closedAt: window },
      select: workSelect,
      orderBy: { closedAt: "desc" },
      take: STATS_ROW_CAP,
    }),
  ]);

  // Le tri final se fait ici et non en base : la question posée est « la
  // PREMIÈRE réponse est-elle partie pendant la période ? », et cette date est
  // le minimum d'une relation, sur lequel une clause SQL ne porte pas.
  const responded = replyCandidates
    .map(flatten)
    .filter(
      (row) =>
        row.firstReplyAt !== null &&
        row.firstReplyAt.getTime() >= from.getTime() &&
        row.firstReplyAt.getTime() <= to.getTime(),
    );

  return {
    created: created.map(({ messages, ...ticket }) => ({
      ...ticket,
      firstReplyAt: messages[0]?.createdAt ?? null,
    })),
    responded,
    closed: closed.map(flatten),
    truncated:
      created.length >= STATS_ROW_CAP ||
      replyCandidates.length >= STATS_ROW_CAP ||
      closed.length >= STATS_ROW_CAP,
  };
}

// ---------------------------------------------------------------------------
// Statistique élémentaire
// ---------------------------------------------------------------------------

function delta(current: number, previous: number): MetricDelta {
  // `null` et non 0 % ni +100 % quand la période précédente est vide : passer de
  // 0 à 3 n'est pas une progression de 300 %, c'est un démarrage. Afficher un
  // pourcentage là où il n'a pas de sens décrédibilise tous les autres.
  const changePercent = previous === 0 ? null : ((current - previous) / previous) * 100;
  return { current, previous, changePercent };
}

/** Quantile par interpolation linéaire, sur une liste déjà triée. */
function quantile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Résumé d'une série de délais.
 *
 * Médiane ET moyenne, jamais l'une seule : un unique ticket oublié trois
 * semaines suffit à doubler la moyenne d'un mois entier, et c'est précisément le
 * genre de chiffre qui fait conclure à tort que « l'équipe met deux jours à
 * répondre ». La médiane dit le cas courant, la moyenne dit le poids des
 * traînards, le neuvième décile dit à quoi ressemble un mauvais jour.
 */
function summarizeDurations(values: number[]): DurationSummary {
  if (values.length === 0) {
    return { count: 0, averageMs: null, medianMs: null, p90Ms: null };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    count: sorted.length,
    averageMs: total / sorted.length,
    medianMs: quantile(sorted, 0.5),
    p90Ms: quantile(sorted, 0.9),
  };
}

/** Délais de première réponse mesurés sur les réponses parties dans la période. */
function firstResponseDurations(rows: WorkRow[]): number[] {
  return rows.flatMap((row) => {
    if (!row.firstReplyAt) return [];
    const elapsed = row.firstReplyAt.getTime() - row.createdAt.getTime();
    // Un délai négatif ne peut venir que d'une reprise de données : on l'écarte
    // plutôt que de le compter comme un zéro flatteur.
    return elapsed >= 0 ? [elapsed] : [];
  });
}

function resolutionDurations(rows: WorkRow[]): number[] {
  return rows.flatMap((row) => {
    if (!row.closedAt) return [];
    const elapsed = row.closedAt.getTime() - row.createdAt.getTime();
    return elapsed >= 0 ? [elapsed] : [];
  });
}

/**
 * Engagements tenus et manqués sur la période.
 *
 * Comptés sur le travail fait, comme les délais : un engagement de première
 * réponse est « tenu » quand la réponse est partie avant l'échéance, « manqué »
 * quand elle est partie après. Les tickets encore sans réponse n'entrent dans
 * aucune des deux colonnes — leur sort n'est pas joué, et ils sont déjà comptés
 * par l'instantané « en retard ». Les tickets sans échéance (priorité sans délai
 * configuré) sont hors sujet : il n'y avait rien à tenir.
 */
function slaOutcome(rows: WorkRow[], kind: "first_response" | "resolution"): SlaOutcome {
  let met = 0;
  let missed = 0;

  for (const row of rows) {
    const doneAt = kind === "first_response" ? row.firstReplyAt : row.closedAt;
    const dueAt = kind === "first_response" ? row.firstResponseDueAt : row.resolutionDueAt;
    if (!doneAt || !dueAt) continue;

    if (doneAt.getTime() <= dueAt.getTime()) met += 1;
    else missed += 1;
  }

  return { committed: met + missed, met, missed };
}

// ---------------------------------------------------------------------------
// Répartitions
// ---------------------------------------------------------------------------

type Reference = { id: string; name: string; color: string | null; order?: number };

/**
 * Répartition d'une dimension, dans l'ordre du paramétrage.
 *
 * L'ordre du paramétrage et non celui des volumes, pour les dimensions qui en
 * ont un (statuts, priorités) : un statut qui passe devant un autre parce qu'il
 * a gagné trois tickets rend la comparaison d'un mois sur l'autre impossible.
 * Les valeurs à zéro sont conservées pour la même raison — leur disparition
 * déplacerait toutes les lignes.
 */
function breakdown(
  counts: Map<string | null, number>,
  references: Reference[],
  { fallbackLabel, sortByCount = false }: { fallbackLabel: string; sortByCount?: boolean },
): BreakdownRow[] {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);

  const rows: BreakdownRow[] = references.map((reference) => ({
    id: reference.id,
    label: reference.name,
    color: reference.color,
    count: counts.get(reference.id) ?? 0,
    share: 0,
  }));

  const orphans = counts.get(null) ?? 0;
  if (orphans > 0) {
    rows.push({ id: "__none__", label: fallbackLabel, color: null, count: orphans, share: 0 });
  }

  if (sortByCount) rows.sort((a, b) => b.count - a.count);

  for (const row of rows) {
    row.share = total > 0 ? row.count / total : 0;
  }

  return rows;
}

function countBy<T>(rows: T[], pick: (row: T) => string | null): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    const key = pick(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Axe du temps & carte d'activité
// ---------------------------------------------------------------------------

function buildTimeline(range: StatsRange, created: CreatedRow[], closed: WorkRow[]): TimelinePoint[] {
  const buckets = buildStatsBuckets(range);
  const createdByKey = new Map<string, number>();
  const closedByKey = new Map<string, number>();

  for (const row of created) {
    const key = bucketKey(row.createdAt, range.bucket);
    createdByKey.set(key, (createdByKey.get(key) ?? 0) + 1);
  }
  for (const row of closed) {
    if (!row.closedAt) continue;
    const key = bucketKey(row.closedAt, range.bucket);
    closedByKey.set(key, (closedByKey.get(key) ?? 0) + 1);
  }

  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    tick: bucket.tick,
    created: createdByKey.get(bucket.key) ?? 0,
    closed: closedByKey.get(bucket.key) ?? 0,
  }));
}

/**
 * Quand les demandes arrivent, jour de semaine par heure.
 *
 * C'est la lecture qui sert à dimensionner une permanence : un pic le lundi
 * matin et un creux le vendredi après-midi ne se voient sur aucune autre vue,
 * l'axe du temps les moyennant tous les deux.
 */
function buildHeatmap(created: CreatedRow[]): ActivityHeatmap {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let max = 0;
  let total = 0;
  let peak: ActivityHeatmap["peak"] = null;

  for (const row of created) {
    // 0 = lundi : la semaine se lit comme un calendrier français, alors que
    // `getDay()` place le dimanche en tête.
    const weekday = (row.createdAt.getDay() + 6) % 7;
    const hour = row.createdAt.getHours();
    const next = matrix[weekday][hour] + 1;
    matrix[weekday][hour] = next;
    total += 1;

    if (next > max) {
      max = next;
      peak = { weekday, hour, count: next };
    }
  }

  return { matrix, max, total, peak };
}

// ---------------------------------------------------------------------------
// Classement de l'équipe
// ---------------------------------------------------------------------------

/**
 * Plafond de lecture du fil de messages, distinct de celui des tickets : un
 * ticket porte plusieurs réponses, la population est donc plus nombreuse.
 */
const MESSAGE_CAP = 60_000;

/**
 * Ce que chaque agent a fait dans la période.
 *
 * La source est le FIL DE MESSAGES, et non le journal d'audit, alors que celui-ci
 * saurait aussi le dire. Deux raisons : le journal est derrière une permission
 * volontairement plus étroite (`audit.view`, un relevé nominatif geste par
 * geste), et le fil est la trace du travail lui-même — une réponse envoyée au
 * client existe indépendamment de ce qui en a été journalisé.
 *
 * « Traité » = avoir répondu publiquement au client, en tickets DISTINCTS. Ni le
 * nombre de messages (répondre trois fois au même dossier n'est pas traiter trois
 * demandes) ni l'assignation (un ticket confié sans réponse n'est pas traité) ne
 * répondaient à la question posée.
 */
async function buildAgentRanking(
  range: StatsRange,
  filters: StatsFilters,
  /**
   * Tickets dont la première réponse publique est partie pendant la période,
   * déjà identifiés par `loadPeriod`. Passés en argument plutôt que recalculés :
   * c'est ce qui garantit que « 1res réponses » du tableau et le délai médian des
   * tuiles portent exactement sur les mêmes tickets.
   */
  firstRepliedInPeriod: Map<string, WorkRow>,
): Promise<{ rows: AgentStatRow[]; truncated: boolean }> {
  const scope = categoryWhere(filters);

  const messages = await prisma.message.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      authorType: "AGENT",
      agentId: { not: null },
      ...(filters.categoryId ? { ticket: { categoryId: filters.categoryId } } : {}),
    },
    select: {
      agentId: true,
      ticketId: true,
      isPrivate: true,
      createdAt: true,
      ticket: { select: { assigneeId: true, categoryId: true } },
    },
    // Croissant : l'attribution de la PREMIÈRE réponse se lit dans cet ordre.
    orderBy: { createdAt: "asc" },
    take: MESSAGE_CAP,
  });

  type Accumulator = {
    handled: Set<string>;
    handledAssigned: Set<string>;
    handledOwnScope: Set<string>;
    publicReplies: number;
    internalNotes: number;
    firstResponseDelays: number[];
  };

  const byAgent = new Map<string, Accumulator>();
  const accumulatorFor = (agentId: string) => {
    const existing = byAgent.get(agentId);
    if (existing) return existing;
    const fresh: Accumulator = {
      handled: new Set(),
      handledAssigned: new Set(),
      handledOwnScope: new Set(),
      publicReplies: 0,
      internalNotes: 0,
      firstResponseDelays: [],
    };
    byAgent.set(agentId, fresh);
    return fresh;
  };

  /** Auteur de la première réponse publique vue dans la période, par ticket. */
  const firstResponders = new Map<string, string>();

  for (const message of messages) {
    if (!message.agentId) continue;
    const accumulator = accumulatorFor(message.agentId);

    if (message.isPrivate) {
      accumulator.internalNotes += 1;
      continue;
    }

    accumulator.publicReplies += 1;
    accumulator.handled.add(message.ticketId);
    if (message.ticket.assigneeId === message.agentId) {
      accumulator.handledAssigned.add(message.ticketId);
    }
    if (!firstResponders.has(message.ticketId)) {
      firstResponders.set(message.ticketId, message.agentId);
    }
  }

  // Deux populations réunies, et c'est délibéré : toute l'équipe en activité, ET
  // les comptes ayant écrit pendant la période même s'ils ont été désactivés
  // depuis. Se limiter aux auteurs de messages masquerait les agents qui n'ont
  // rien traité — or une ligne à zéro est une information, et la faire
  // disparaître transformerait le tableau en palmarès des présents.
  //
  // Le périmètre de chacun vient de ses groupes, comme le pré-filtrage de la file
  // de tickets (`getAgentDefaultCategoryIds`). Un agent sans groupe n'a pas de
  // périmètre déclaré : la colonne reste à zéro plutôt que de tout compter à son
  // crédit.
  const agents = await prisma.agent.findMany({
    where: {
      OR: [
        { id: { in: [...byAgent.keys()] } },
        { isActive: true, approvalStatus: "APPROVED", anonymizedAt: null },
      ],
    },
    select: { id: true, name: true, groups: { select: { products: { select: { id: true } } } } },
  });

  const scopeByAgent = new Map<string, Set<string>>(
    agents.map((agent) => [
      agent.id,
      new Set(agent.groups.flatMap((group) => group.products.map((product) => product.id))),
    ]),
  );

  // Second passage, une fois les périmètres connus : le premier ne pouvait pas
  // encore dire si un ticket relevait du produit de son auteur.
  for (const message of messages) {
    if (!message.agentId || message.isPrivate) continue;
    const products = scopeByAgent.get(message.agentId);
    if (!products || !message.ticket.categoryId) continue;
    if (products.has(message.ticket.categoryId)) {
      accumulatorFor(message.agentId).handledOwnScope.add(message.ticketId);
    }
  }

  // Attribution de la première réponse : uniquement sur les tickets dont la
  // première réponse est RÉELLEMENT partie pendant la période. Sans ce filtre, le
  // premier message vu ici serait crédité comme « première réponse » alors que le
  // client avait déjà reçu un mot le mois précédent.
  const firstResponseCounts = new Map<string, number>();
  for (const [ticketId, agentId] of firstResponders) {
    const ticket = firstRepliedInPeriod.get(ticketId);
    if (!ticket?.firstReplyAt) continue;

    firstResponseCounts.set(agentId, (firstResponseCounts.get(agentId) ?? 0) + 1);
    const elapsed = ticket.firstReplyAt.getTime() - ticket.createdAt.getTime();
    if (elapsed >= 0) accumulatorFor(agentId).firstResponseDelays.push(elapsed);
  }

  // Deux instantanés par agent, en deux regroupements plutôt qu'en une requête
  // par personne : la charge qu'il porte en ce moment, et les dossiers qui lui
  // étaient confiés et qui se sont refermés pendant la période.
  const [openAssigned, closedAssigned] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...scope, assigneeId: { not: null }, status: { isClosed: false } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...scope, assigneeId: { not: null }, closedAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
  ]);

  const openByAgent = new Map(
    openAssigned.flatMap((row) => (row.assigneeId ? [[row.assigneeId, row._count._all]] : [])),
  );
  const closedByAgent = new Map(
    closedAssigned.flatMap((row) => (row.assigneeId ? [[row.assigneeId, row._count._all]] : [])),
  );

  const rows: AgentStatRow[] = agents.map((agent) => {
    const accumulator = byAgent.get(agent.id);
    const delays = accumulator?.firstResponseDelays ?? [];

    return {
      id: agent.id,
      name: agent.name,
      handledTickets: accumulator?.handled.size ?? 0,
      handledAssignedToThem: accumulator?.handledAssigned.size ?? 0,
      handledOnOwnScope: accumulator?.handledOwnScope.size ?? 0,
      publicReplies: accumulator?.publicReplies ?? 0,
      internalNotes: accumulator?.internalNotes ?? 0,
      firstResponses: firstResponseCounts.get(agent.id) ?? 0,
      medianFirstResponseMs: summarizeDurations(delays).medianMs,
      closedAssigned: closedByAgent.get(agent.id) ?? 0,
      openAssignedNow: openByAgent.get(agent.id) ?? 0,
    };
  });

  // Du plus actif au moins actif, puis par nom : c'est la question posée
  // (« qui a traité le plus de tickets ? »), et deux agents à égalité doivent
  // garder le même ordre d'un affichage à l'autre.
  rows.sort(
    (a, b) =>
      b.handledTickets - a.handledTickets ||
      b.publicReplies - a.publicReplies ||
      a.name.localeCompare(b.name, "fr"),
  );

  return { rows, truncated: messages.length >= MESSAGE_CAP };
}

// ---------------------------------------------------------------------------
// Classement des clients
// ---------------------------------------------------------------------------

/** Contacts listés au maximum. Au-delà, le classement cesse d'être un classement. */
const CLIENT_RANKING_SIZE = 12;

/**
 * Qui a le plus écrit sur la période.
 *
 * Calculé sur les tickets déjà lus en mémoire, sans requête d'agrégat
 * supplémentaire : c'est la même population que les volumes affichés au-dessus,
 * donc les deux ne peuvent pas se contredire. Seuls les noms des contacts
 * retenus sont ensuite relus en base.
 *
 * Ce classement porte sur des personnes physiques : il en dit le strict
 * nécessaire — un nom, une société, des compteurs. Ni email, ni téléphone, qui
 * n'aident en rien à lire un volume et sont à leur place sur la fiche du contact.
 */
async function buildClientRanking(
  created: CreatedRow[],
): Promise<{ rows: ClientStatRow[]; distinct: number }> {
  type Tally = { tickets: number; closed: number; awaitingReply: number; lastTicketAt: Date };
  const byClient = new Map<string, Tally>();

  for (const row of created) {
    if (!row.clientId) continue;
    const tally = byClient.get(row.clientId) ?? {
      tickets: 0,
      closed: 0,
      awaitingReply: 0,
      lastTicketAt: row.createdAt,
    };

    tally.tickets += 1;
    if (row.closedAt) tally.closed += 1;
    if (!row.firstReplyAt && !row.closedAt) tally.awaitingReply += 1;
    if (row.createdAt > tally.lastTicketAt) tally.lastTicketAt = row.createdAt;

    byClient.set(row.clientId, tally);
  }

  const top = [...byClient.entries()]
    .sort((a, b) => b[1].tickets - a[1].tickets || b[1].lastTicketAt.getTime() - a[1].lastTicketAt.getTime())
    .slice(0, CLIENT_RANKING_SIZE);

  const clients = await prisma.client.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, name: true, company: true, anonymizedAt: true },
  });
  const byId = new Map(clients.map((client) => [client.id, client]));

  const rows = top.flatMap(([id, tally]) => {
    const client = byId.get(id);
    // Fiche supprimée entre la lecture des tickets et celle des contacts : rien à
    // nommer, donc rien à classer.
    if (!client) return [];

    return [
      {
        id,
        name: client.name,
        company: client.company,
        anonymized: client.anonymizedAt !== null,
        tickets: tally.tickets,
        closed: tally.closed,
        awaitingReply: tally.awaitingReply,
        lastTicketAt: tally.lastTicketAt,
      },
    ];
  });

  return { rows, distinct: byClient.size };
}

// ---------------------------------------------------------------------------
// Rapport complet
// ---------------------------------------------------------------------------

const queueTicketSelect = {
  id: true,
  number: true,
  subject: true,
  createdAt: true,
  priority: { select: { name: true, color: true } },
  status: { select: { name: true } },
} satisfies Prisma.TicketSelect;

/** Les tickets qu'un chiffre désigne, pour qu'on puisse aller les traiter. */
const QUEUE_PREVIEW_SIZE = 6;

export async function getStatsReport(
  range: StatsRange,
  filters: StatsFilters = {},
): Promise<StatsReport> {
  const scope = categoryWhere(filters);
  const now = new Date();

  // Les deux périodes d'abord : le classement de l'équipe a besoin de savoir
  // quels tickets ont reçu leur première réponse pendant la période, et cette
  // liste est un produit de la lecture de la période courante.
  const [current, previous] = await Promise.all([
    loadPeriod(range.from, range.to, filters),
    loadPeriod(range.previousFrom, range.previousTo, filters),
  ]);

  const firstRepliedInPeriod = new Map(current.responded.map((row) => [row.id, row]));

  const [
    agentRanking,
    statuses,
    priorities,
    categories,
    sources,
    openNow,
    awaitingReplyNow,
    unassignedNow,
    breachedNow,
    pausedNow,
    totalEverCreated,
    oldestUnassigned,
  ] = await Promise.all([
    buildAgentRanking(range, filters, firstRepliedInPeriod),
    prisma.ticketStatus.findMany({ select: { id: true, name: true, color: true }, orderBy: { order: "asc" } }),
    prisma.ticketPriority.findMany({ select: { id: true, name: true, color: true }, orderBy: { order: "asc" } }),
    prisma.ticketCategory.findMany({ select: { id: true, name: true, color: true }, orderBy: { order: "asc" } }),
    prisma.source.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ticket.count({ where: { ...scope, status: { isClosed: false } } }),
    // « Sans première réponse » se lit dans le fil, pas dans `firstRespondedAt`
    // (voir `firstReplySelect`) : la colonne est vide sur tout l'historique
    // antérieur au SLA, et le compteur annoncerait des tickets abandonnés qui ont
    // en réalité reçu une réponse.
    prisma.ticket.count({
      where: {
        ...scope,
        status: { isClosed: false },
        closedAt: null,
        messages: { none: PUBLIC_AGENT_REPLY },
      },
    }),
    prisma.ticket.count({ where: { ...scope, status: { isClosed: false }, assigneeId: null } }),
    // `AND` et non un étalement : `breachedSlaWhere` porte son propre `OR`,
    // qu'une fusion à plat écraserait (même précaution que la file de tickets).
    prisma.ticket.count({
      where: { ...scope, status: { isClosed: false }, AND: [breachedSlaWhere(now)] },
    }),
    prisma.ticket.count({
      where: { ...scope, status: { isClosed: false }, slaPausedAt: { not: null } },
    }),
    prisma.ticket.count({ where: scope }),
    prisma.ticket.findMany({
      where: { ...scope, status: { isClosed: false }, assigneeId: null },
      select: queueTicketSelect,
      // Le plus ancien d'abord : c'est celui qui attend depuis le plus longtemps
      // que quelqu'un s'en saisisse, donc le plus urgent à montrer.
      orderBy: { createdAt: "asc" },
      take: QUEUE_PREVIEW_SIZE,
    }),
  ]);

  const answered = current.created.filter((row) => row.firstReplyAt !== null).length;
  const previousAnswered = previous.created.filter((row) => row.firstReplyAt !== null).length;

  const stillAwaiting = current.created.filter(
    (row) => !row.firstReplyAt && !row.closedAt,
  ).length;

  const clientRanking = await buildClientRanking(current.created);

  const channelCounts = countBy(current.created, (row) => row.formSourceId);
  // Les tickets sans source administrable (arrivés par email ou créés à la main)
  // ne sont pas « sans canal » : leur canal est l'enum historique. Ils sont donc
  // ventilés par `TicketSource` plutôt que réunis dans un fourre-tout.
  const enumChannels = new Map<string, number>();
  for (const row of current.created) {
    if (row.formSourceId) continue;
    enumChannels.set(row.source, (enumChannels.get(row.source) ?? 0) + 1);
  }

  const channelReferences: Reference[] = [
    ...sources.map((source) => ({ id: source.id, name: source.name, color: null })),
    ...[...enumChannels.keys()].map((value) => ({
      id: `enum:${value}`,
      name: ticketSourceLabels[value as TicketSource],
      color: null,
    })),
  ];
  for (const [value, count] of enumChannels) {
    channelCounts.set(`enum:${value}`, count);
  }
  channelCounts.delete(null);

  return {
    truncated: current.truncated || previous.truncated || agentRanking.truncated,

    volume: {
      created: delta(current.created.length, previous.created.length),
      answered: delta(answered, previousAnswered),
      closed: delta(current.closed.length, previous.closed.length),
      stillAwaitingReply: stillAwaiting,
      mergedAsDuplicate: current.created.filter((row) => row.mergedIntoId !== null).length,
      answerRate: current.created.length > 0 ? answered / current.created.length : null,
    },

    now: {
      open: openNow,
      awaitingReply: awaitingReplyNow,
      unassigned: unassignedNow,
      breached: breachedNow,
      slaPaused: pausedNow,
      totalEverCreated,
    },

    durations: {
      firstResponse: summarizeDurations(firstResponseDurations(current.responded)),
      resolution: summarizeDurations(resolutionDurations(current.closed)),
      previousMedianFirstResponseMs: summarizeDurations(firstResponseDurations(previous.responded))
        .medianMs,
      previousMedianResolutionMs: summarizeDurations(resolutionDurations(previous.closed)).medianMs,
    },

    sla: {
      firstResponse: slaOutcome(current.responded, "first_response"),
      resolution: slaOutcome(current.closed, "resolution"),
    },

    timeline: buildTimeline(range, current.created, current.closed),
    heatmap: buildHeatmap(current.created),

    breakdowns: {
      statuses: breakdown(countBy(current.created, (row) => row.statusId), statuses, {
        fallbackLabel: "Statut supprimé",
      }),
      priorities: breakdown(countBy(current.created, (row) => row.priorityId), priorities, {
        fallbackLabel: "Priorité supprimée",
      }),
      // Produits et canaux se lisent par volume : ils n'ont pas d'ordre naturel
      // (contrairement aux statuts et aux priorités) et la question posée est
      // justement « lequel sollicite le plus le support ? ».
      products: breakdown(countBy(current.created, (row) => row.categoryId), categories, {
        fallbackLabel: "Aucun produit renseigné",
        sortByCount: true,
      }),
      channels: breakdown(channelCounts, channelReferences, {
        fallbackLabel: "Canal inconnu",
        sortByCount: true,
      }),
    },

    agents: agentRanking.rows,
    clients: clientRanking.rows,
    distinctClients: clientRanking.distinct,

    unassigned: {
      count: unassignedNow,
      oldest: oldestUnassigned.map((ticket) => ({
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        createdAt: ticket.createdAt,
        priorityName: ticket.priority.name,
        priorityColor: ticket.priority.color,
        statusName: ticket.status.name,
      })),
    },
  };
}
