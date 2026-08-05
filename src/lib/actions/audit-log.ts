"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/require-permission";
import {
  actionsInFamily,
  isAuditAction,
  isAuditFamily,
  type AuditFamily,
} from "@/lib/audit-actions";

/**
 * Lecture du journal d'audit.
 *
 * Réservé aux administrateurs (`requireAdmin`) : le journal dit qui a ouvert
 * quel dossier et à quelle heure, ce qui en fait aussi un relevé d'activité
 * nominatif de chaque agent. Le laisser à toute l'équipe transformerait un outil
 * de conformité en outil de surveillance entre collègues.
 *
 * Aucune écriture ici, et volontairement : rien dans l'application ne modifie ni
 * ne supprime une entrée (voir le modèle `AuditLog`).
 */

const auditSelect = {
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

const DEFAULT_PAGE_SIZE = 50;

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

export async function getAuditLog(filters: AuditLogFilters = {}) {
  await requireAdmin();

  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  const from = parseDay(filters.from, false);
  const to = parseDay(filters.to, true);

  const where: Prisma.AuditLogWhereInput = {
    ...actionFilter(filters),
    ...searchFilter(filters.search),
    actorId: filters.actorId || undefined,
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: auditSelect,
      // Le plus récent d'abord : on ouvre un journal pour savoir ce qui vient de
      // se passer, pas pour relire le premier jour de mise en service.
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize };
}

/**
 * Agents apparaissant dans le journal, pour le filtre « auteur ».
 *
 * Tirés du journal et non de la table des agents : un compte supprimé a pu
 * laisser des traces, et son nom doit rester sélectionnable — c'est souvent
 * précisément celui qu'on cherche.
 */
export async function getAuditActors() {
  await requireAdmin();

  const rows = await prisma.auditLog.groupBy({
    by: ["actorId", "actorName"],
    _count: { _all: true },
    orderBy: { actorName: "asc" },
  });

  // Un agent renommé entre deux traces produit deux lignes pour un même
  // identifiant : elles sont recollées ici, sinon le filtre proposerait deux fois
  // la même personne sous deux noms.
  const byId = new Map<string, { id: string; name: string; entryCount: number }>();
  for (const row of rows) {
    if (!row.actorId) continue;
    const existing = byId.get(row.actorId);
    byId.set(row.actorId, {
      id: row.actorId,
      // Le dernier nom connu, par ordre alphabétique de la requête : arbitraire
      // mais stable, et les deux désignent la même personne.
      name: existing?.name ?? row.actorName,
      entryCount: (existing?.entryCount ?? 0) + row._count._all,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
