import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortalConfig } from "@/lib/portal-theme";

export function portalLogoUrl(config: PortalConfig) {
  return config.logoAssetId ? `/api/portal/assets/${config.logoAssetId}` : "/logoIdeeri.jpeg";
}

/**
 * Logo + nom + baseline du portail. `interactive={false}` rend un <div> plutôt
 * qu'un lien : utilisé par l'aperçu des réglages, où un clic ne doit pas
 * quitter la page d'administration.
 */
export function PortalBrand({
  config,
  interactive = true,
  className,
}: {
  config: PortalConfig;
  interactive?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {config.showLogo && (
        <Image
          src={portalLogoUrl(config)}
          alt={config.siteName}
          width={config.logoHeight * 6}
          height={config.logoHeight}
          style={{ height: config.logoHeight }}
          className="w-auto"
          priority
          unoptimized
        />
      )}
      {config.showSiteName && (
        <span className="font-display text-base font-medium">{config.siteName}</span>
      )}
      {config.showTagline && config.tagline && (
        <span className="text-sm font-medium text-muted-foreground">{config.tagline}</span>
      )}
    </>
  );

  const classes = cn("flex items-center gap-2.5", className);
  if (!interactive) return <div className={classes}>{content}</div>;
  return (
    <Link href="/" className={classes}>
      {content}
    </Link>
  );
}
