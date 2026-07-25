import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { portalFontClassNames } from "@/lib/portal-fonts";
import { portalThemeCss } from "@/lib/portal-theme";

// Tout le portail dépend de réglages modifiables en admin (thème, textes, FAQ
// publiée) — sans ça, Next préconstruirait ces pages en statique et un
// changement dans /settings/portal n'apparaîtrait qu'au prochain déploiement.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPortalSettings();
  return {
    title: {
      default: config.metaTitle ?? `Support — ${config.siteName}`,
      template: `%s — ${config.siteName}`,
    },
    description:
      config.metaDescription ??
      `Le centre d'aide ${config.siteName} : trouvez une réponse dans la FAQ ou créez un ticket support.`,
    icons: config.faviconAssetId
      ? { icon: `/api/portal/assets/${config.faviconAssetId}` }
      : undefined,
  };
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const config = await getPortalSettings();

  return (
    <>
      {/* Thème du portail : variables CSS calculées à partir des réglages.
          `precedence` demande à React de hisser la balise dans le <head>. */}
      <style
        precedence="portal-theme"
        href="portal-theme"
        dangerouslySetInnerHTML={{ __html: portalThemeCss(config) }}
      />
      <div
        className={cn(
          "portal-theme min-h-screen bg-background text-foreground",
          // Active les variantes `dark:` des composants partagés (boutons,
          // champs…) ; la palette elle-même vient déjà des variables ci-dessus.
          config.colorMode === "DARK" && "dark",
          portalFontClassNames(config.fontSans, config.fontDisplay),
        )}
      >
        {children}
      </div>
    </>
  );
}
