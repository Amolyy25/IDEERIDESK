import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { defaultLandingPath } from "@/lib/app-navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/icons/google-icon";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Accès refusé. Ce compte Google n'est pas autorisé, ou a été refusé / désactivé par un administrateur.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  // `user.id` n'est posé que si l'agent existe, est actif et a été approuvé :
  // sans lui, on reste sur l'écran de connexion plutôt que de rebondir sur une
  // page protégée qui renverrait ici (boucle de redirection). Un compte
  // reconnu mais pas encore tranché n'a que `approvalStatus`.
  if (session?.user?.id) {
    redirect(defaultLandingPath(session.user.permissions));
  }
  if (session?.user?.approvalStatus) {
    redirect("/en-attente");
  }

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ?? "La connexion a échoué. Merci de réessayer."
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-t-2 border-t-primary bg-card p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-6">
          <Image
            src="/logoIdeeri.jpeg"
            alt="Ideeri"
            width={120}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">Connexion</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Accédez à l&apos;espace agent avec votre compte Google professionnel.
            </p>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            // Retour sur cette page plutôt que sur `/tickets` : la destination
            // dépend des permissions, que l'on ne connaît pas avant d'être
            // connecté. Le garde en tête de fichier s'en charge alors, sans
            // boucle possible — il ne renvoie que vers une page ouverte.
            await signIn("google", { redirectTo: "/login" });
          }}
        >
          <Button type="submit" variant="outline" size="lg" className="w-full gap-2.5 font-medium">
            <GoogleIcon className="h-4 w-4" />
            Se connecter avec Google
          </Button>
        </form>

        {errorMessage && (
          <p className="mt-4 text-center text-sm text-destructive">{errorMessage}</p>
        )}

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
