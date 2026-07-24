import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // `session.user.id` is only set when the agent record still exists and is
  // active (see the `session` callback in `@/auth`) — this is the real,
  // DB-backed authorization gate, re-checked on every protected navigation.
  // Middleware only does a cheap edge-side "is there a session at all" check.
  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar currentAgent={{ name: session.user.name, email: session.user.email }} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
