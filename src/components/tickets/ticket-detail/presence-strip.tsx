"use client";

import { Eye, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TicketPresenceItem } from "@/lib/actions/ticket-presence";

/**
 * Bande de collision, au-dessus du champ de réponse.
 *
 * Deux niveaux, et le second seul justifie d'attirer l'œil :
 *
 * — quelqu'un CONSULTE le dossier. Utile à savoir, sans plus : à deux on peut
 *   lire le même fil sans conséquence. Bande grise, ton neutre.
 * — quelqu'un RÉDIGE une réponse. C'est le cas à éviter : le client recevra deux
 *   réponses, parfois contradictoires, et personne ne s'en apercevra avant sa
 *   relance. Bande ambre, à hauteur du champ qu'on est en train de remplir.
 *
 * Placée au-dessus du champ et non dans l'en-tête de la fiche : c'est le seul
 * endroit que l'agent regarde forcément avant d'écrire.
 *
 * Formulée au présent et sans horodatage, parce que c'est le sens exact de la
 * donnée — une présence dit « en ce moment », pas « à telle heure ». Afficher
 * « vu il y a 12 s » inviterait à interpréter un délai qui n'est que celui du
 * battement.
 */
export function PresenceStrip({
  others,
  className,
}: {
  others: TicketPresenceItem[];
  /**
   * Encadrement laissé à l'appelant : la bande est un bandeau d'en-tête dans la
   * zone de rédaction (bordure basse seule) et un bloc autonome au-dessus du
   * message de lecture seule (bordure complète). Le composant ne peut pas
   * deviner lequel, et un `border-b` orphelin se voit.
   */
  className?: string;
}) {
  if (others.length === 0) return null;

  const composing = others.filter((other) => other.composing);
  const viewing = others.filter((other) => !other.composing);
  const isCollision = composing.length > 0;

  return (
    <div
      // `role="status"` et non `alert` : l'information est utile, elle n'a pas à
      // interrompre un lecteur d'écran au milieu d'une phrase en cours de dictée.
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs",
        isCollision
          ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      {isCollision ? (
        <>
          <PenLine className="size-3.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-medium">{names(composing)}</strong>{" "}
            {composing.length > 1 ? "rédigent" : "rédige"} une réponse en même temps que vous.
            {/* Dit explicitement : l'application n'empêche pas le double envoi,
                elle le signale. Laisser croire qu'elle protège serait pire que de
                ne rien afficher. */}{" "}
            Accordez-vous avant d&apos;envoyer — les deux réponses partiraient au client.
          </span>
          {viewing.length > 0 && (
            <span className="opacity-80">· {names(viewing)} consulte aussi ce ticket.</span>
          )}
        </>
      ) : (
        <>
          <Eye className="size-3.5 shrink-0" aria-hidden />
          <span>
            {names(viewing)} {viewing.length > 1 ? "consultent" : "consulte"} ce ticket en ce
            moment.
          </span>
        </>
      )}
    </div>
  );
}

/** « Camille Martin », « Camille Martin et Jean Dupont », « Camille Martin et 2 autres ». */
function names(items: TicketPresenceItem[]): string {
  const [first, second, ...rest] = items;
  if (!first) return "";
  if (!second) return first.name;
  // Au-delà de deux noms, la phrase devient une énumération qu'on ne lit plus :
  // le nombre suffit, l'important est qu'ils sont plusieurs.
  if (rest.length === 0) return `${first.name} et ${second.name}`;
  return `${first.name} et ${rest.length + 1} autres`;
}
