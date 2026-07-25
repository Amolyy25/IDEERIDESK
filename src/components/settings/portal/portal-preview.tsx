"use client";

import { cn } from "@/lib/utils";
import { portalCssVariables, type PortalConfig } from "@/lib/portal-theme";
import { portalFontClassNames } from "@/lib/portal-fonts";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalHero } from "@/components/portal/portal-hero";
import { PortalPathCards } from "@/components/portal/portal-path-cards";
import { PortalFooter } from "@/components/portal/portal-footer";

// Le portail est rendu à sa largeur « bureau » puis réduit : les classes
// Tailwind réagissent à la largeur de la fenêtre, pas à celle du conteneur, donc
// un rendu directement dans une colonne étroite afficherait la version mobile.
const PREVIEW_WIDTH = 1200;
const PREVIEW_SCALE = 0.36;

/**
 * Aperçu du portail à partir des valeurs en cours d'édition (avant
 * enregistrement). Rendu avec les vrais composants du portail, `interactive` à
 * false : aucun clic ne quitte la page de réglages.
 */
export function PortalPreview({ config }: { config: PortalConfig }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div
        // Hauteur cadrée sur le haut du portail (barre + hero + cartes), ce qui
        // couvre tout ce que ces réglages modifient visuellement.
        className="relative h-[430px] overflow-hidden"
      >
        <div
          className={cn(
            "portal-theme absolute left-0 top-0 origin-top-left bg-background text-foreground",
            config.colorMode === "DARK" && "dark",
            portalFontClassNames(config.fontSans, config.fontDisplay),
          )}
          style={
            {
              // Variables CSS en style inline : elles passent ainsi devant le
              // thème de l'application d'administration qui entoure l'aperçu.
              ...portalCssVariables(config),
              width: PREVIEW_WIDTH,
              transform: `scale(${PREVIEW_SCALE})`,
            } as React.CSSProperties
          }
        >
          <PortalHeader config={config} faqHref="#faq" interactive={false} />
          <PortalHero config={config} />
          <PortalPathCards config={config} showFaq={config.faqEnabled} interactive={false} />
          <PortalFooter config={config} faqHref="#faq" interactive={false} />
        </div>
      </div>
    </div>
  );
}
