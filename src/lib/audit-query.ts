import type { Prisma } from "@/generated/prisma/client";
import { actionsInFamily, isAuditAction, isAuditFamily, type AuditFamily } from "@/lib/audit-actions";

/**
 * Lecture du journal d'audit : ce que la requête sélectionne, et comment les
 * filtres de l'écran s'y traduisent.
 *
 * Module à part, sans `"use server"`, parce que DEUX appelants s'en servent : la
 * page (via `getAuditLog`) et l'export CSV (via sa route). C'est ce qui garantit
 * que le fichier exporté couvre exactement le périmètre filtré à l'écran — deux
 * constructions de `where` séparées auraient fini par diverger, et un export qui
 * ne correspond pas au filtre affiché est un export trompeur.
 *
 * Seul l'ORDRE diffère, délibérément : l'écran montre le plus récent d'abord,
 * l'export va du plus ancien au plus récent (voir la route).
 */

export const auditSelect = {
  id: true,
  action: true,
  createdAt: true,
  actorId: true,
  actorName: true,
  actorEmail: true,
  ticketId: true,
  ticketNumber: true,
  ticketSubject: true,
  changes: true,
  summary: true,
} satisfies Prisma.AuditLogSelect;

export type AuditLogEntry = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

export type AuditLogFilters = {
  page?: number;
  pageSize?: number;
  /** Numéro de ticket, sujet, nom ou email d'agent. */
  search?: string;
  actorId?: string;
  /** Nature du geste : consultation, réponse, modification. */
  family?: string;
  /** Action précise — prime sur `family` quand les deux sont fournis. */
  action?: string;
  /** Bornes de date au format `YYYY-MM-DD` (jour inclus de part et d'autre). */
  from?: string;
  to?: string;
};

export const DEFAULT_PAGE_SIZE = 50;

/** `YYYY-MM-DD` → date locale, ou `null` si la saisie n'est pas une date. */
function parseDay(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function actionFilter(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  // Une action précise l'emporte : le filtre fin est toujours plus explicite que
  // le filtre par famille dont il descend.
  if (filters.action && isAuditAction(filters.action)) {
    return { action: filters.action };
  }
  if (filters.family && isAuditFamily(filters.family)) {
    return { action: { in: actionsInFamily(filters.family as AuditFamily) } };
  }
  return {};
}

function searchFilter(search: string | undefined): Prisma.AuditLogWhereInput {
  const term = search?.trim();
  if (!term) return {};

  // « 128 » comme « #128 » : le numéro de ticket est la première chose qu'on
  // tape en cherchant l'historique d'un dossier.
  const searchedNumber = Number(term.replace(/^#/, ""));
  const numberMatch: Prisma.AuditLogWhereInput[] =
    Number.isInteger(searchedNumber) && searchedNumber > 0 ? [{ ticketNumber: searchedNumber }] : [];

  return {
    OR: [
      ...numberMatch,
      { ticketSubject: { contains: term, mode: "insensitive" } },
      { actorName: { contains: term, mode: "insensitive" } },
      { actorEmail: { contains: term, mode: "insensitive" } },
      { summary: { contains: term, mode: "insensitive" } },
    ],
  };
}

export function buildAuditWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const from = parseDay(filters.from, false);
  const to = parseDay(filters.to, true);

  return {
    ...actionFilter(filters),
    ...searchFilter(filters.search),
    actorId: filters.actorId || undefined,
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };
}

/** Filtres lus depuis l'URL — partagés par la page et la route d'export. */
export function auditFiltersFromParams(params: URLSearchParams): AuditLogFilters {
  return {
    search: params.get("search") ?? undefined,
    actorId: params.get("actorId") ?? undefined,
    family: params.get("family") ?? undefined,
    action: params.get("action") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };
}
