import { CircleHelp } from "lucide-react";
import { PORTAL_ICONS } from "@/lib/portal-theme";

/**
 * Rend une icône choisie dans les réglages du portail. Passer par un composant
 * dédié (plutôt que de résoudre l'icône dans le composant appelant) garde la
 * résolution du nom au plus près du rendu : l'icône n'est jamais stockée dans
 * une variable de composant côté appelant.
 */
export function PortalIcon({
  name,
  fallback,
  className,
}: {
  name: string;
  /** Icône utilisée si `name` ne fait plus partie de la liste blanche. */
  fallback: string;
  className?: string;
}) {
  const Icon = PORTAL_ICONS[name] ?? PORTAL_ICONS[fallback] ?? CircleHelp;
  return <Icon className={className} />;
}
