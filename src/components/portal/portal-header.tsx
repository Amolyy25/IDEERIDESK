import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortalConfig, PortalLink } from "@/lib/portal-theme";
import { PortalBrand } from "@/components/portal/portal-brand";

type NavEntry = PortalLink & { key: string };

/**
 * Liens de la barre de navigation : les deux liens intégrés (FAQ, connexion)
 * puis les liens libres ajoutés depuis les réglages.
 */
export function portalNavEntries(config: PortalConfig, faqHref: string | null): NavEntry[] {
  const entries: NavEntry[] = [];
  if (config.navShowFaq && faqHref) {
    entries.push({ key: "faq", label: "FAQ", href: faqHref, newTab: false });
  }
  config.navLinks.forEach((link, index) => {
    entries.push({ ...link, key: `custom-${index}` });
  });
  if (config.navShowLogin) {
    entries.push({ key: "login", label: "Se connecter", href: "/login", newTab: false });
  }
  return entries;
}

function NavLinks({
  entries,
  interactive,
  className,
}: {
  entries: NavEntry[];
  interactive: boolean;
  className?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-1 text-sm", className)}>
      {entries.map((entry) => {
        const classes =
          "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground";
        return interactive ? (
          <Link
            key={entry.key}
            href={entry.href}
            target={entry.newTab ? "_blank" : undefined}
            rel={entry.newTab ? "noreferrer" : undefined}
            className={classes}
          >
            {entry.label}
          </Link>
        ) : (
          <span key={entry.key} className={classes}>
            {entry.label}
          </span>
        );
      })}
    </div>
  );
}

function CtaButton({ config, interactive }: { config: PortalConfig; interactive: boolean }) {
  if (!config.navCtaEnabled) return null;
  const classes =
    "ml-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90";
  return interactive ? (
    <Link href="/nouveau-ticket" className={classes}>
      {config.navCtaLabel}
    </Link>
  ) : (
    <span className={classes}>{config.navCtaLabel}</span>
  );
}

/**
 * Barre de navigation du portail, entièrement pilotée par les réglages
 * (disposition, adhérence au scroll, flou, bordure, liens, bouton d'action).
 */
export function PortalHeader({
  config,
  faqHref,
  interactive = true,
  containerClassName = "max-w-5xl",
}: {
  config: PortalConfig;
  /** Cible du lien FAQ intégré, ou null pour le masquer (aucun article publié). */
  faqHref: string | null;
  interactive?: boolean;
  containerClassName?: string;
}) {
  const entries = portalNavEntries(config, faqHref);
  const showLinks = config.navVariant !== "MINIMAL";

  const headerClasses = cn(
    "z-40",
    config.navBordered && "border-b",
    config.navSticky && interactive && "sticky top-0",
    config.navBlur ? "bg-background/80 backdrop-blur" : "bg-background",
  );
  const container = cn("mx-auto px-6 py-4", containerClassName);

  if (config.navVariant === "CENTERED") {
    return (
      <header className={headerClasses}>
        <div className={cn(container, "flex flex-col items-center gap-3")}>
          <PortalBrand config={config} interactive={interactive} />
          <nav className="flex flex-wrap items-center justify-center gap-1">
            <NavLinks entries={entries} interactive={interactive} />
            <CtaButton config={config} interactive={interactive} />
          </nav>
        </div>
      </header>
    );
  }

  if (config.navVariant === "LINKS_CENTER") {
    return (
      <header className={headerClasses}>
        <div className={cn(container, "grid grid-cols-[1fr_auto_1fr] items-center gap-4")}>
          <PortalBrand config={config} interactive={interactive} />
          <nav className="hidden justify-center sm:flex">
            <NavLinks entries={entries} interactive={interactive} />
          </nav>
          <nav className="flex items-center justify-end gap-1">
            <NavLinks
              entries={entries}
              interactive={interactive}
              className="flex sm:hidden"
            />
            <CtaButton config={config} interactive={interactive} />
          </nav>
        </div>
      </header>
    );
  }

  // LOGO_LEFT (défaut) et MINIMAL partagent la même structure : seule la
  // présence des liens change.
  return (
    <header className={headerClasses}>
      <div className={cn(container, "flex items-center justify-between gap-4")}>
        <PortalBrand config={config} interactive={interactive} />
        <nav className="flex items-center gap-1">
          {showLinks && <NavLinks entries={entries} interactive={interactive} />}
          <CtaButton config={config} interactive={interactive} />
        </nav>
      </div>
    </header>
  );
}
