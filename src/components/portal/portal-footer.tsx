import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortalConfig, PortalLink } from "@/lib/portal-theme";
import { PortalIcon } from "@/components/portal/portal-icon";

/**
 * Pied de page du portail : texte + icône à gauche, liens à droite (les liens
 * intégrés FAQ / création de ticket / connexion suivent les mêmes réglages que
 * la barre de navigation, puis viennent les liens libres).
 */
export function PortalFooter({
  config,
  faqHref,
  interactive = true,
  containerClassName = "max-w-5xl",
}: {
  config: PortalConfig;
  faqHref: string | null;
  interactive?: boolean;
  containerClassName?: string;
}) {
  if (!config.footerEnabled) return null;

  const links: (PortalLink & { key: string })[] = [];
  if (config.navShowFaq && faqHref) {
    links.push({ key: "faq", label: "FAQ", href: faqHref, newTab: false });
  }
  if (config.navCtaEnabled) {
    links.push({
      key: "ticket",
      label: config.navCtaLabel,
      href: "/nouveau-ticket",
      newTab: false,
    });
  }
  config.footerLinks.forEach((link, index) => links.push({ ...link, key: `custom-${index}` }));
  if (config.navShowLogin) {
    links.push({ key: "login", label: "Se connecter", href: "/login", newTab: false });
  }

  return (
    <footer className="border-t">
      <div
        className={cn(
          "mx-auto flex flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row",
          containerClassName,
        )}
      >
        <div className="flex items-center gap-2">
          <PortalIcon name={config.footerIcon} fallback="LifeBuoy" className="h-4 w-4" />
          <span>{config.footerText ?? config.siteName}</span>
        </div>
        {links.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-5">
            {links.map((link) =>
              interactive ? (
                <Link
                  key={link.key}
                  href={link.href}
                  target={link.newTab ? "_blank" : undefined}
                  rel={link.newTab ? "noreferrer" : undefined}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ) : (
                <span key={link.key}>{link.label}</span>
              ),
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
