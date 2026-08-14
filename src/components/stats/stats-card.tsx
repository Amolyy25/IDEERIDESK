import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Le cadre commun de toutes les cartes de /stats : un titre, une phrase qui dit
 * SUR QUOI la carte porte, et le contenu.
 *
 * La phrase n'est pas décorative. Chaque carte de cette page mesure une
 * population différente (les tickets arrivés, les réponses parties, les dossiers
 * clos, l'état de la file à l'instant présent) et un tableau de bord dont on ne
 * sait pas ce qu'il compte est un tableau de bord qu'on interprète de travers.
 * Le cadre impose donc cette ligne à chaque carte.
 */
export function StatsCard({
  title,
  scope,
  action,
  children,
  className,
}: {
  title: string;
  /** Population mesurée, en une phrase courte. */
  scope: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card shadow-xs",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{scope}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </section>
  );
}

/** Ce qu'affiche une carte quand la période n'a rien à montrer. */
export function StatsEmpty({ children }: { children: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}
