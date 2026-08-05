"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import {
  auditSelect,
  buildAuditWhere,
  DEFAULT_PAGE_SIZE,
  type AuditLogFilters,
} from "@/lib/audit-query";

/**
 * Lecture du journal d'audit.
 *
 * Réservé aux administrateurs (`requireAdmin`) : le journal dit qui a ouvert
 * quel dossier et à quelle heure, ce qui en fait aussi un relevé d'activité
 * nominatif de chaque agent. Le laisser à toute l'équipe transformerait un outil
 * de conformité en outil de surveillance entre collègues.
 *
 * Aucune action d'écriture ici, et c'est une garantie, pas un oubli : le journal
 * n'est modifiable par personne depuis l'application — ni un agent, ni un
 * administrateur. La seule écriture possible est l'ajout, par `recordAudit`
 * (src/lib/audit.ts), et la base elle-même refuse le reste (voir les déclencheurs
 * de la migration `audit_log_append_only`).
 */

export async function getAuditLog(filters: AuditLogFilters = {}) {
  await requirePermission("audit.view");

  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = buildAuditWhere(filters);

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
  await requirePermission("audit.view");

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
