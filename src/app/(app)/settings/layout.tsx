import { auth } from "@/auth";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <h1 className="text-lg font-semibold tracking-tight">Paramètres</h1>

      <div className="mt-5 grid gap-6 lg:mt-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav permissions={session?.user?.permissions ?? []} />
        {/* Placement explicite : `SettingsNav` rend deux <nav> (colonne large
            écran + bande horizontale mobile) dont un seul est affiché. Sans
            col-start, le contenu se retrouve dans la colonne de 13rem dès que
            le compte d'items de grille change. */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
      </div>
    </div>
  );
}
