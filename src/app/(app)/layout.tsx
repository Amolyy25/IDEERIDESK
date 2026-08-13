import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUnreadTicketCount, countPendingApprovalMessages } from "@/lib/actions/tickets";
import { countPendingAgents } from "@/lib/actions/agents";
import { getMyNotifications } from "@/lib/actions/notifications";
import { Sidebar } from "@/components/layout/sidebar";
import { RetroMode } from "@/components/layout/retro-mode";
import { getEmailAccountStatus } from "@/lib/actions/email-account";
import { can } from "@/lib/permissions";
import { defaultLandingPath } from "@/lib/app-navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Compte créé à la première connexion mais pas encore tranché par un admin :
  // aucune page de l'espace agent ne doit s'ouvrir. Testé avant `id`, qui n'est
  // justement pas posé pour un compte non approuvé — sans cet ordre, l'agent en
  // attente atterrirait sur /login sans comprendre pourquoi.
  if (session?.user?.approvalStatus && session.user.approvalStatus !== "APPROVED") {
    redirect("/en-attente");
  }

  // `session.user.id` is only set when the agent record still exists, is active
  // AND has been approved (see the `session` callback in `@/auth`) — this is the
  // real, DB-backed authorization gate, re-checked on every protected
  // navigation. Middleware only does a cheap edge-side "is there a session at
  // all" check, et les Server Actions ont leurs propres gardes : cette
  // redirection protège l'affichage, pas les données.
  if (!session?.user?.id) {
    redirect("/login");
  }

  const permissions = session.user.permissions ?? [];

  // Compte approuvé mais dépouillé de toutes ses permissions : aucune page de
  // cet espace ne s'ouvrirait, et chacune le renverrait vers une autre. Le
  // filet est ici, dans le layout, pour couvrir aussi une page qui oublierait
  // sa propre garde.
  if (defaultLandingPath(permissions) === "/aucun-acces") {
    redirect("/aucun-acces");
  }

  // Chaque compteur est conditionné à la permission qui ouvre la page qu'il
  // décore : l'action correspondante refuse les autres, et un appel refusé ici
  // ferait échouer le rendu de TOUTES les pages de l'espace agent, y compris
  // celles auxquelles l'agent a droit.
  const [unreadCount, emailStatus, pendingAgentCount, notifications, pendingApprovalCount] =
    await Promise.all([
      can(permissions, "tickets.view") ? getUnreadTicketCount() : Promise.resolve(0),
      getEmailAccountStatus(),
      can(permissions, "team.view") ? countPendingAgents() : Promise.resolve(0),
      getMyNotifications(),
      can(permissions, "approvals.handle")
        ? countPendingApprovalMessages()
        : Promise.resolve(0),
    ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        currentAgent={{ name: session.user.name, email: session.user.email }}
        permissions={permissions}
        unreadCount={unreadCount}
        pendingAgentCount={pendingAgentCount}
        pendingApprovalCount={pendingApprovalCount}
        notifications={notifications.items}
        unreadNotificationCount={notifications.unreadCount}
        gmailConnected={emailStatus.connected}
      />
      {/* `min-w-0` : sans ça, un contenu large (tableau, texte long) élargit
          `main` au-delà du viewport et le parent `overflow-hidden` le rogne. */}
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>

      {/* Monté sur l'espace agent uniquement, jamais sur le portail ni le widget :
          le mandant d'une agence n'a pas signé pour nos blagues. Ne rend rien
          tant que la séquence n'a pas été jouée. */}
      <RetroMode />
    </div>
  );
}
