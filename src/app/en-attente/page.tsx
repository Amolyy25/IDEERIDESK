import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, XCircle } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Demande en attente · Ideeri Desk" };

/**
 * Écran d'attente d'un compte créé à la première connexion Google mais pas
 * encore tranché par un admin. Volontairement hors du groupe `(app)` : pas de
 * sidebar, aucune donnée métier chargée.
 */
export default async function PendingApprovalPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");
  if (session.user.approvalStatus === "APPROVED") redirect("/tickets");

  const isRejected = session.user.approvalStatus === "REJECTED";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-t-2 border-t-primary bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-6">
          <Image
            src="/logoIdeeri.jpeg"
            alt="Ideeri"
            width={120}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            {isRejected ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Clock className="h-5 w-5 text-muted-foreground" />
            )}
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {isRejected ? "Demande refusée" : "Demande en attente de validation"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isRejected ? (
              <>
                L&apos;accès à l&apos;espace agent a été refusé pour ce compte. Si vous pensez
                qu&apos;il s&apos;agit d&apos;une erreur, rapprochez-vous d&apos;un administrateur.
              </>
            ) : (
              <>
                Votre compte a bien été créé. Un administrateur doit maintenant valider votre
                accès à l&apos;espace agent. Vous recevrez un email dès que c&apos;est fait —
                inutile de rester sur cette page.
              </>
            )}
          </p>
        </div>

        <div className="mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Compte concerné</p>
          <p className="mt-0.5 truncate text-sm font-medium">{session.user.email}</p>
        </div>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Se déconnecter
          </Button>
        </form>

        <Link
          href="/"
          className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          ← Retour au portail
        </Link>
      </div>
    </div>
  );
}
