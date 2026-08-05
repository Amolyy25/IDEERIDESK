import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUnreadTicketCount, countPendingApprovalMessages } from "@/lib/actions/tickets";
import { countPendingAgents } from "@/lib/actions/agents";
import { getMyNotifications } from "@/lib/actions/notifications";
import { Sidebar } from "@/components/layout/sidebar";
import { getEmailAccountStatus } from "@/lib/actions/email-account";

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

  const [unreadCount, emailStatus, pendingAgentCount, notifications, pendingApprovalCount] =
    await Promise.all([
      getUnreadTicketCount(),
      getEmailAccountStatus(),
      session.user.role === "ADMIN" ? countPendingAgents() : Promise.resolve(0),
      getMyNotifications(),
      // Le compteur n'est relevé que pour un agent habilité : l'action refuse
      // les autres, l'appeler pour eux ferait échouer tout le rendu.
      session.user.canApprove ? countPendingApprovalMessages() : Promise.resolve(0),
    ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        currentAgent={{ name: session.user.name, email: session.user.email }}
        unreadCount={unreadCount}
        pendingAgentCount={pendingAgentCount}
        canApprove={session.user.canApprove ?? false}
        pendingApprovalCount={pendingApprovalCount}
        isAdmin={session.user.role === "ADMIN"}
        notifications={notifications.items}
        unreadNotificationCount={notifications.unreadCount}
        gmailConnected={emailStatus.connected}
      />
      {/* `min-w-0` : sans ça, un contenu large (tableau, texte long) élargit
          `main` au-delà du viewport et le parent `overflow-hidden` le rogne. */}
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
