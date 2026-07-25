import { cn } from "@/lib/utils";
import { PORTAL_INTRO_FALLBACK, type PortalConfig } from "@/lib/portal-theme";

/** Bandeau d'accueil du portail : accroche, titre, message d'introduction. */
export function PortalHero({ config }: { config: PortalConfig }) {
  if (!config.heroEnabled) return null;
  const centered = config.heroAlign === "CENTER";

  return (
    <section className="relative overflow-hidden border-b">
      {config.heroGlow && (
        // Halo dans la couleur principale — la seule tache de couleur vive de
        // la page, signature de marque.
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-32 h-72 w-[42rem] max-w-full rounded-full bg-primary/25 blur-[120px]",
            centered ? "inset-x-0 mx-auto" : "-left-32",
          )}
        />
      )}
      <div
        className={cn("relative mx-auto max-w-5xl px-6 py-20 sm:py-28", centered && "text-center")}
      >
        {config.heroEyebrow && (
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
            {config.heroEyebrow}
          </p>
        )}
        <h1
          className={cn(
            "mt-4 max-w-3xl font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-6xl",
            centered && "mx-auto",
          )}
        >
          {config.heroTitle ?? `Bienvenue sur le support ${config.siteName}`}
        </h1>
        <p className={cn("mt-5 max-w-xl text-base text-muted-foreground", centered && "mx-auto")}>
          {config.introMessage ?? PORTAL_INTRO_FALLBACK}
        </p>
      </div>
    </section>
  );
}
