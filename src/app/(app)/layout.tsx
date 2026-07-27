import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUnreadTicketCount } from "@/lib/actions/tickets";
import { countPendingAgents } from "@/lib/actions/agents";
import { Sidebar } from "@/components/layout/sidebar";
import { GmailAutoSync } from "@/components/layout/gmail-auto-sync";
import { getEmailAccountStatus } from "@/lib/actions/email-account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // `session.user.id` is only set when the agent record still exists and is
  // active (see the `session` callback in `@/auth`) — this is the real,
  // DB-backed authorization gate, re-checked on every protected navigation.
  // Middleware only does a cheap edge-side "is there a session at all" check.
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Compte créé à la première connexion mais pas encore tranché par un admin :
  // aucune page de l'espace agent ne doit s'ouvrir.
  if (session.user.approvalStatus !== "APPROVED") {
    redirect("/en-attente");
  }

  const [unreadCount, emailStatus, pendingAgentCount] = await Promise.all([
    getUnreadTicketCount(),
    getEmailAccountStatus(),
    session.user.role === "ADMIN" ? countPendingAgents() : Promise.resolve(0),
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {emailStatus.connected && <GmailAutoSync />}
      <Sidebar
        currentAgent={{ name: session.user.name, email: session.user.email }}
        unreadCount={unreadCount}
        pendingAgentCount={pendingAgentCount}
      />
      {/* `min-w-0` : sans ça, un contenu large (tableau, texte long) élargit
          `main` au-delà du viewport et le parent `overflow-hidden` le rogne. */}
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
