/**
 * Engagements de délai (SLA) : le calcul, et rien d'autre.
 *
 * Un SLA, ici, est une HORLOGE PAR TICKET et non une statistique : l'échéance
 * est calculée à l'arrivée du ticket, stockée avec lui, et regardée en temps
 * réel dans la file. Deux horloges distinctes, à ne jamais confondre :
 *
 *   — première réponse : de l'arrivée du ticket au premier message d'un agent
 *     au client (l'accusé de réception automatique n'en est pas un) ;
 *   — résolution : de l'arrivée à la clôture.
 *
 * Ce module est PUR : aucune lecture de base, aucun `"use server"`. C'est ce qui
 * lui permet d'être importé aussi bien par les Server Actions que par la file de
 * tickets, qui est un composant client et doit réafficher le temps restant sans
 * aller-retour serveur. Les accès à la base vivent dans `sla-store.ts`.
 */

import type { Prisma } from "@/generated/prisma/client";

export const SLA_SETTING_KEYS = {
  clockMode: "sla_clock_mode",
  businessDays: "sla_business_days",
  businessStart: "sla_business_start",
  businessEnd: "sla_business_end",
  warningMinutes: "sla_warning_minutes",
} as const;

/** Combien de temps avant l'échéance l'email d'alerte part. 0 = pas d'alerte. */
export const DEFAULT_SLA_WARNING_MINUTES = 30;

export function parseSlaWarningMinutes(value: string | undefined): number {
  const minutes = Number((value ?? "").trim());
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_SLA_WARNING_MINUTES;
  // Une semaine : au-delà, « imminent » ne veut plus rien dire, et une valeur
  // aberrante saisie par erreur alerterait sur toute la file d'un coup.
  return Math.min(Math.round(minutes), 7 * 24 * 60);
}

/**
 * `calendar` : l'horloge tourne 24 h/24. Un ticket urgent (2 h) déposé vendredi
 * 18 h est dû vendredi 20 h.
 * `business` : elle ne tourne que pendant les heures d'ouverture du support. Le
 * même ticket est dû lundi 10 h.
 */
export type SlaClockMode = "calendar" | "business";

export type SlaCalendar = {
  mode: SlaClockMode;
  /** Jours ouvrés, au format ISO : 1 = lundi … 7 = dimanche. */
  days: number[];
  /** Ouverture et fermeture, en minutes depuis minuit. */
  startMinute: number;
  endMinute: number;
  /** Fuseau dans lequel ces horaires se lisent (réglage « Fuseau horaire »). */
  timeZone: string;
};

export const DEFAULT_SLA_CALENDAR: SlaCalendar = {
  mode: "calendar",
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  timeZone: "Europe/Paris",
};

/** Les deux échéances d'un ticket, telles qu'écrites en base à sa création. */
export type SlaDueDates = {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
};

/** Délais portés par la priorité du ticket, en minutes. */
export type SlaTargets = {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Lecture des réglages
// ---------------------------------------------------------------------------

/**
 * Calendrier reconstruit à partir des réglages bruts (des chaînes, puisque
 * `GlobalSetting.value` est du texte).
 *
 * Toute valeur illisible retombe sur le défaut plutôt que de lever : un réglage
 * mal saisi ne doit pas faire tomber la file de tickets. Un calendrier vide ou
 * inversé (fermeture avant ouverture) rendrait par ailleurs le décompte en
 * heures ouvrées infini — il repasse donc en décompte calendaire, seul mode qui
 * aboutit toujours.
 */
export function parseSlaCalendar(values: Record<string, string | undefined>): SlaCalendar {
  const mode: SlaClockMode = values[SLA_SETTING_KEYS.clockMode] === "business" ? "business" : "calendar";

  const days = (values[SLA_SETTING_KEYS.businessDays] ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

  const startMinute = parseTimeOfDay(values[SLA_SETTING_KEYS.businessStart]) ?? DEFAULT_SLA_CALENDAR.startMinute;
  const endMinute = parseTimeOfDay(values[SLA_SETTING_KEYS.businessEnd]) ?? DEFAULT_SLA_CALENDAR.endMinute;

  const usable = days.length > 0 && endMinute > startMinute;

  return {
    mode: mode === "business" && usable ? "business" : "calendar",
    days: days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : DEFAULT_SLA_CALENDAR.days,
    startMinute,
    endMinute,
    timeZone: values.timezone?.trim() || DEFAULT_SLA_CALENDAR.timeZone,
  };
}

/** « 09:00 » → 540. `null` si la valeur n'est pas une heure de la journée. */
export function parseTimeOfDay(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 540 → « 09:00 ». */
export function formatTimeOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Arithmétique du calendrier
// ---------------------------------------------------------------------------

/**
 * Instant lu sur une horloge murale du fuseau, exprimé comme un horodatage UTC.
 *
 * Le décompte en heures ouvrées se fait dans cet espace « heure locale » : c'est
 * le seul où « 18 h » veut dire quelque chose. Passer par `Intl` plutôt que par
 * un décalage fixe est ce qui fait que le changement d'heure ne décale pas les
 * échéances de soixante minutes deux fois par an.
 */
function localTimestamp(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `hour12: false` rend minuit sous la forme « 24 » dans certains
  // environnements : sans ce repli, une échéance tombant à minuit serait
  // projetée sur le lendemain.
  const hour = read("hour") % 24;

  return Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"));
}

/** Décalage du fuseau à cet instant, en millisecondes. */
function zoneOffset(date: Date, timeZone: string): number {
  return localTimestamp(date, timeZone) - date.getTime();
}

/**
 * Opération inverse : l'instant réel correspondant à une heure murale.
 *
 * Deux passes, parce que le décalage à appliquer dépend de l'instant qu'on
 * cherche : la première approximation suffit à tomber du bon côté d'un
 * changement d'heure, la seconde corrige l'heure obtenue.
 */
function fromLocalTimestamp(local: number, timeZone: string): Date {
  let guess = new Date(local - zoneOffset(new Date(local), timeZone));
  guess = new Date(local - zoneOffset(guess, timeZone));
  return guess;
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'un horodatage local. */
function isoWeekday(local: number): number {
  const day = new Date(local).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Minuit du jour local contenant cet horodatage. */
function startOfLocalDay(local: number): number {
  return Math.floor(local / DAY_MS) * DAY_MS;
}

/**
 * Avance de `durationMs` de temps DÉCOMPTÉ à partir de `from`.
 *
 * En mode calendaire, c'est une addition. En heures ouvrées, on consomme la
 * durée fenêtre d'ouverture par fenêtre d'ouverture, en sautant les soirs et les
 * jours non ouvrés.
 *
 * La boucle est bornée : un calendrier incohérent qui ne laisserait aucune
 * fenêtre ouverte rendrait sinon la file de tickets inaccessible. Passée la
 * borne, on retombe sur un décompte calendaire, qui aboutit toujours.
 */
export function addSlaDuration(from: Date, durationMs: number, calendar: SlaCalendar): Date {
  if (calendar.mode === "calendar" || durationMs <= 0) {
    return new Date(from.getTime() + durationMs);
  }

  const { timeZone, days, startMinute, endMinute } = calendar;
  let remaining = durationMs;
  let cursor = localTimestamp(from, timeZone);

  // Deux ans de jours ouvrés : très au-delà de tout engagement réaliste, et
  // suffisamment bas pour que l'échec soit immédiat plutôt que bloquant.
  for (let guard = 0; guard < 750; guard += 1) {
    const dayStart = startOfLocalDay(cursor) + startMinute * MINUTE_MS;
    const dayEnd = startOfLocalDay(cursor) + endMinute * MINUTE_MS;

    if (!days.includes(isoWeekday(cursor)) || cursor >= dayEnd) {
      cursor = startOfLocalDay(cursor) + DAY_MS + startMinute * MINUTE_MS;
      continue;
    }

    // Un ticket déposé à 7 h du matin n'entame son délai qu'à l'ouverture.
    const windowStart = Math.max(cursor, dayStart);
    const available = dayEnd - windowStart;

    if (remaining <= available) {
      return fromLocalTimestamp(windowStart + remaining, timeZone);
    }

    remaining -= available;
    cursor = startOfLocalDay(cursor) + DAY_MS + startMinute * MINUTE_MS;
  }

  return new Date(from.getTime() + durationMs);
}

/**
 * Temps DÉCOMPTÉ entre deux instants — l'inverse de `addSlaDuration`.
 *
 * Sert à mesurer une suspension : une pause du vendredi soir au lundi matin ne
 * doit repousser l'échéance d'aucune minute si le support est fermé le week-end.
 */
export function slaDurationBetween(from: Date, to: Date, calendar: SlaCalendar): number {
  const total = to.getTime() - from.getTime();
  if (calendar.mode === "calendar" || total <= 0) {
    return Math.max(total, 0);
  }

  const { timeZone, days, startMinute, endMinute } = calendar;
  const target = localTimestamp(to, timeZone);
  let cursor = localTimestamp(from, timeZone);
  let counted = 0;

  for (let guard = 0; guard < 750 && cursor < target; guard += 1) {
    const dayStart = startOfLocalDay(cursor) + startMinute * MINUTE_MS;
    const dayEnd = startOfLocalDay(cursor) + endMinute * MINUTE_MS;

    if (days.includes(isoWeekday(cursor))) {
      const windowStart = Math.max(cursor, dayStart);
      const windowEnd = Math.min(target, dayEnd);
      if (windowEnd > windowStart) counted += windowEnd - windowStart;
    }

    cursor = startOfLocalDay(cursor) + DAY_MS + startMinute * MINUTE_MS;
  }

  return counted;
}

/**
 * Les deux échéances d'un ticket qui arrive.
 *
 * `alreadyPausedMs` rejoue les suspensions déjà accumulées : il n'intervient
 * qu'au recalcul (changement de priorité), pour ne pas rendre à l'équipe le
 * temps pendant lequel l'horloge était arrêtée.
 */
export function computeSlaDueDates({
  from,
  targets,
  calendar,
  alreadyPausedMs = 0,
}: {
  from: Date;
  targets: SlaTargets;
  calendar: SlaCalendar;
  alreadyPausedMs?: number;
}): SlaDueDates {
  const due = (minutes: number | null) => {
    if (minutes === null || minutes <= 0) return null;
    const base = addSlaDuration(from, minutes * MINUTE_MS, calendar);
    return alreadyPausedMs > 0 ? addSlaDuration(base, alreadyPausedMs, calendar) : base;
  };

  return {
    firstResponseDueAt: due(targets.firstResponseMinutes),
    resolutionDueAt: due(targets.resolutionMinutes),
  };
}

// ---------------------------------------------------------------------------
// État d'un ticket
// ---------------------------------------------------------------------------

/** Les champs d'horloge d'un ticket — tout ce dont l'affichage a besoin. */
export type SlaTicketFields = {
  firstResponseDueAt: Date | string | null;
  resolutionDueAt: Date | string | null;
  firstRespondedAt: Date | string | null;
  slaPausedAt: Date | string | null;
  closedAt: Date | string | null;
};

export type SlaTarget = "first_response" | "resolution";

export type SlaState =
  /** Aucun engagement sur ce ticket : priorité sans délai, ou ticket antérieur au SLA. */
  | { kind: "none" }
  /** Ticket clos, ou les deux engagements tenus : plus rien ne tourne. */
  | { kind: "done" }
  /** Horloge suspendue par le statut courant. */
  | { kind: "paused"; target: SlaTarget; dueAt: Date }
  | { kind: "running"; target: SlaTarget; dueAt: Date; remainingMs: number }
  | { kind: "breached"; target: SlaTarget; dueAt: Date; overdueMs: number };

/**
 * Où en est ce ticket, vu de l'agent qui parcourt sa file.
 *
 * Une seule échéance est rendue, jamais deux : celle qui appelle une action
 * maintenant. Tant que personne n'a écrit au client, c'est la première réponse ;
 * une fois répondu, c'est la résolution. Afficher les deux de front dans une
 * ligne de liste ne dirait pas à l'agent ce qu'il doit faire.
 */
export function resolveSlaState(ticket: SlaTicketFields, now: Date = new Date()): SlaState {
  if (toDate(ticket.closedAt)) return { kind: "done" };

  const firstRespondedAt = toDate(ticket.firstRespondedAt);
  const firstResponseDueAt = toDate(ticket.firstResponseDueAt);
  const resolutionDueAt = toDate(ticket.resolutionDueAt);

  let target: SlaTarget | null = null;
  let dueAt: Date | null = null;

  if (!firstRespondedAt && firstResponseDueAt) {
    target = "first_response";
    dueAt = firstResponseDueAt;
  } else if (resolutionDueAt) {
    target = "resolution";
    dueAt = resolutionDueAt;
  }

  if (!target || !dueAt) {
    // Répondu, et aucun engagement de résolution : il n'y a plus d'horloge, mais
    // dire « aucun engagement » d'un ticket dont la première réponse a été
    // tenue serait faux.
    return firstRespondedAt && firstResponseDueAt ? { kind: "done" } : { kind: "none" };
  }

  if (toDate(ticket.slaPausedAt)) return { kind: "paused", target, dueAt };

  const remainingMs = dueAt.getTime() - now.getTime();
  if (remainingMs < 0) return { kind: "breached", target, dueAt, overdueMs: -remainingMs };
  return { kind: "running", target, dueAt, remainingMs };
}

export const slaTargetLabels: Record<SlaTarget, string> = {
  first_response: "Première réponse",
  resolution: "Résolution",
};

/**
 * Condition « en retard », partagée par la vue, son compteur et la colonne de la
 * file — un seul endroit à corriger, et aucun risque qu'un onglet annonce 12
 * tickets au-dessus d'une liste qui en montre 4.
 *
 * Trois exclusions, chacune pour une raison :
 *   — `closedAt: null` : un dossier clos n'appelle plus d'action, y compris le
 *     doublon fermé par une fusion sans qu'on ait jamais écrit à son auteur ;
 *   — `slaPausedAt: null` : une horloge arrêtée ne produit pas de retard ;
 *   — `firstRespondedAt: null` sur la première branche : une fois le client
 *     servi, seule la résolution reste en jeu.
 */
export function breachedSlaWhere(now: Date = new Date()): Prisma.TicketWhereInput {
  return {
    closedAt: null,
    slaPausedAt: null,
    OR: [
      { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
      { resolutionDueAt: { lt: now } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/**
 * Durée courte, à l'échelle de ce qu'on lit dans une file : « 45 min »,
 * « 3 h 20 », « 2 j 4 h ». Jamais deux unités au-delà des heures — « 2 j 4 h
 * 12 min » se lit moins vite qu'il ne se calcule.
 */
export function formatSlaDuration(ms: number): string {
  const totalMinutes = Math.max(Math.round(Math.abs(ms) / MINUTE_MS), 0);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} j ${restHours} h` : `${days} j`;
}

/** « 2 h », « 2 j » — un engagement tel qu'on l'énonce dans les réglages. */
export function formatSlaTarget(minutes: number): string {
  return formatSlaDuration(minutes * MINUTE_MS);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
