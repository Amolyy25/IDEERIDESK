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

/** Message affiché à la place du contenu quand la section est réservée aux admins. */
export function SettingsAdminOnly({ href }: { href: string }) {
  return (
    <SettingsSection href={href}>
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium">Section réservée aux administrateurs</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Demandez à un administrateur de modifier ces réglages.
        </p>
      </div>
    </SettingsSection>
  );
}
