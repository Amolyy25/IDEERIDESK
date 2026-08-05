import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { defaultLandingPath } from "@/lib/app-navigation";
import { can, type PermissionKey } from "@/lib/permissions";

/**
 * Garde d'AFFICHAGE d'une page de l'espace agent.
 *
 * À ne pas confondre avec `requirePermission` (src/lib/require-permission.ts) :
 * celle-ci protège la donnée, celle-là protège l'écran. Les deux sont
 * nécessaires et aucune ne remplace l'autre — une redirection ne s'exécute que
 * pour une navigation de page, jamais quand une Server Action est appelée
 * directement en HTTP.
 *
 * Redirection et pas 404 : la page existe, elle n'est simplement pas pour cet
 * agent. Et pas vers `/tickets` en dur — l'accès aux tickets se retire lui
 * aussi, un agent qui ne les voit pas y serait renvoyé en boucle.
 */
export async function requirePageAccess(permission: PermissionKey): Promise<Session> {
  const session = await auth();

  if (!can(session?.user?.permissions, permission)) {
    redirect(defaultLandingPath(session?.user?.permissions));
  }

  // `can` a déjà écarté le visiteur sans session : à ce point elle existe.
  return session as Session;
}
