import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Gardes d'accès des Server Actions et des routes API.
 *
 * Une action exportée depuis un module `"use server"` EST un endpoint HTTP :
 * l'UI peut masquer un bouton, la page peut rediriger, rien de tout cela ne
 * s'exécute quand l'action est appelée directement. La garde en première
 * instruction de la fonction est donc la seule frontière réelle.
 *
 * `auth()` ne pose `id`, `role` et les permissions fines que pour un agent
 * actif ET approuvé (voir le callback `session` dans `@/auth`) : la présence
 * de `id` vaut déjà « compte tranché par un admin ».
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

/** Agent habilité à modifier tickets et clients (pas un compte en lecture seule). */
export async function requireCanRespond(): Promise<Session> {
  const session = await requireApprovedAgent();
  if (!session.user.canRespond) {
    throw new Error("Votre compte est en lecture seule.");
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireApprovedAgent();
  if (session.user.role !== "ADMIN") {
    throw new Error("Action réservée aux administrateurs.");
  }
  return session;
}

export async function requireCanApprove(): Promise<Session> {
  const session = await requireApprovedAgent();
  if (!session.user.canApprove) {
    throw new Error("Vous n'avez pas la permission de valider les réponses.");
  }
  return session;
}
