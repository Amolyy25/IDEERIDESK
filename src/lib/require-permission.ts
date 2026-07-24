import { auth } from "@/auth";

/**
 * Guards for actions that must stay restricted regardless of what the UI
 * shows (settings pages can hide a button, but the server action behind it
 * is the actual security boundary — anyone could otherwise call it directly).
 */

export async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Action réservée aux administrateurs.");
  }
  return session;
}

export async function requireCanApprove() {
  const session = await auth();
  if (!session?.user?.canApprove) {
    throw new Error("Vous n'avez pas la permission de valider les réponses.");
  }
  return session;
}
