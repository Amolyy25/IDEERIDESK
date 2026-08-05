import { auth } from "@/auth";
import type { Session } from "next-auth";
import { PERMISSIONS, can, type PermissionKey } from "@/lib/permissions";

/**
 * Gardes d'accès des Server Actions et des routes API.
 *
 * Une action exportée depuis un module `"use server"` EST un endpoint HTTP :
 * l'UI peut masquer un bouton, la page peut rediriger, rien de tout cela ne
 * s'exécute quand l'action est appelée directement. La garde en première
 * instruction de la fonction est donc la seule frontière réelle.
 *
 * `auth()` ne pose `id`, `role` et les permissions que pour un agent actif ET
 * approuvé (voir le callback `session` dans `@/auth`) : la présence de `id`
 * vaut déjà « compte tranché par un admin ».
 *
 * `requirePermission` est la garde par défaut ; `requireApprovedAgent` ne
 * subsiste que pour les lectures transverses (la liste des agents assignables,
 * les statuts affichés dans un filtre) qu'aucune page ne possède en propre, et
 * `requireAdmin` pour le seul geste qu'aucune permission n'accorde : nommer un
 * administrateur.
 */

const UNAUTHORIZED = "Non autorisé.";

/** Tout agent actif et approuvé — le minimum pour lire une donnée métier. */
export async function requireApprovedAgent(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error(UNAUTHORIZED);
  }
  return session;
}

/**
 * Agent portant la permission demandée.
 *
 * Le message de refus vient du registre : il dit ce qui manque, pas seulement
 * que « c'est refusé » — c'est ce qui permet à l'intéressé de savoir quoi
 * demander à un administrateur.
 */
export async function requirePermission(key: PermissionKey): Promise<Session> {
  const session = await requireApprovedAgent();
  if (!can(session.user.permissions, key)) {
    throw new Error(PERMISSIONS[key].denial);
  }
  return session;
}

/**
 * Administrateur au sens du rôle.
 *
 * À réserver à ce que le rôle seul accorde — en pratique : nommer ou révoquer
 * un administrateur. Tout le reste passe par une permission, sans quoi le
 * découpage ne sert à rien. Un administrateur porte de toute façon l'intégralité
 * du registre, donc franchit aussi toutes les gardes `requirePermission`.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireApprovedAgent();
  if (session.user.role !== "ADMIN") {
    throw new Error("Action réservée aux administrateurs.");
  }
  return session;
}
