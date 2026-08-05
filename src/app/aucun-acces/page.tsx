import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { defaultLandingPath } from "@/lib/app-navigation";

export const metadata = { title: "Aucun accès · Ideeri Desk" };

/**
 * Écran d'un compte approuvé mais dont toutes les permissions ont été retirées.
 *
 * Hors du groupe `(app)`, comme `/en-attente`, et pour la même raison : c'est le
 * seul endroit qui n'exige rien. Sans lui, un agent sans aucune permission serait
 * renvoyé de page en page — chacune le redirigeant vers une autre à laquelle il
 * n'a pas droit non plus.
 */
export default async function NoAccessPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  // Une permission rendue entre-temps : on n'a plus rien à faire ici. Le calcul
  // est le même que celui des redirections, il ne peut donc pas renvoyer vers
  // une page fermée.
  const landing = defaultLandingPath(session.user.permissions);
  if (landing !== "/aucun-acces") redirect(landing);

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
            <Lock className="h-5 w-5 text-muted-foreground" />
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">Aucun accès pour le moment</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre compte est bien actif, mais aucune permission ne lui est accordée. Un
            administrateur peut vous en attribuer depuis la page Équipe — vos accès seront
            effectifs dès votre prochaine navigation, sans reconnexion.
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
