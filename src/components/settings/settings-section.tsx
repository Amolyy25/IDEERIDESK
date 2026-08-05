import { auth } from "@/auth";
import { PERMISSIONS, can } from "@/lib/permissions";
import { settingsItem, settingsTitle } from "@/lib/settings-navigation";

/**
 * En-tête commun à toutes les sections de réglages : titre et description
 * viennent du plan de navigation, l'action principale de la page se place à
 * droite du titre.
 */
export function SettingsSection({
  href,
  action,
  children,
}: {
  /** Route de la section, telle que déclarée dans SETTINGS_GROUPS. */
  href: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const item = settingsItem(href);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-medium tracking-tight">{settingsTitle(item)}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{item.description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * L'agent a-t-il la permission déclarée par cette section ?
 *
 * Chaque page de réglages ouvre là-dessus. Le contrôle reste dans la page et
 * non dans le layout : une section refusée doit garder son titre et sa
 * description — l'agent voit à quoi il n'a pas accès, ce qui lui permet de
 * demander la bonne chose. Un layout qui masque tout ne dit rien.
 *
 * Ce n'est, là encore, qu'une garde d'affichage : les Server Actions derrière
 * chaque formulaire portent la même permission.
 */
export async function canOpenSettings(href: string) {
  const session = await auth();
  return can(session?.user?.permissions, settingsItem(href).permission);
}

/** Message affiché à la place du contenu quand la permission manque. */
export function SettingsNoAccess({ href }: { href: string }) {
  const { permission } = settingsItem(href);

  return (
    <SettingsSection href={href}>
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium">Section verrouillée</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          Il vous manque la permission «&nbsp;{PERMISSIONS[permission].label}&nbsp;». Demandez-la à
          un administrateur depuis la page Équipe.
        </p>
      </div>
    </SettingsSection>
  );
}
