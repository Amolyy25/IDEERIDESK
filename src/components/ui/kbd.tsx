"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Le rappel d'un raccourci clavier, posé dans le bouton qui l'exécute.
 *
 * Écrit sur le bouton et non dans une page d'aide : un raccourci ne s'apprend
 * qu'au moment où l'on s'apprête à faire le geste à la main. C'est aussi la
 * raison de sa discrétion — il doit se laisser lire par-dessus le libellé la
 * dixième fois, sans le concurrencer la première.
 *
 * Les couleurs sont prises sur le texte courant (`bg-current/10`) : la même
 * touche se pose ainsi sur un bouton clair comme sur un bouton plein, sans
 * qu'aucun point d'appel n'ait à décrire son fond.
 */
export function Kbd({ className, children, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      {...props}
      // Non lu à voix haute : le nom accessible du bouton est son libellé, et
      // le raccourci est déjà annoncé par son `title`. « Envoyer ⌘ Entrée »
      // ferait un nom de bouton illisible.
      aria-hidden
      className={cn(
        "hidden rounded border border-current/20 bg-current/10 px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium opacity-70 sm:inline-block",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * La touche de modification de la machine : ⌘ sur un Mac, Ctrl ailleurs.
 *
 * `null` tant que la réponse n'est pas connue, c'est-à-dire au rendu serveur et
 * jusqu'à l'hydratation. Deviner mal serait pire que se taire : afficher « Ctrl »
 * à un utilisateur de Mac lui fait essayer un raccourci qui ne marchera pas.
 * Les appelants n'affichent donc rien tant que la valeur est nulle — le rappel
 * apparaît une image après l'hydratation, bien avant qu'on ait fini de lire le
 * message auquel on répond.
 */
export function useModifierKey(): ModifierKey {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type ModifierKey = "⌘" | "Ctrl" | null;

/**
 * La machine ne change pas en cours de session : l'instantané est calculé une
 * fois, gardé dans le module, et resservi identique à tous les boutons de la
 * page. `useSyncExternalStore` compare les instantanés d'un rendu à l'autre —
 * un calcul refait à chaque appel renverrait la même chaîne, mais interdirait
 * toute évolution future de ce crochet vers une vraie source qui change.
 */
let detected: ModifierKey = null;

/** Rien à écouter : la disposition du clavier ne change pas sous les pieds. */
function subscribe() {
  return () => {};
}

function getSnapshot(): ModifierKey {
  if (detected === null) {
    // `userAgentData.platform` d'abord : `navigator.platform` est officiellement
    // obsolète, mais reste le seul renseignement de Safari et de Firefox.
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ||
      navigator.platform ||
      navigator.userAgent;
    detected = /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
  }
  return detected;
}

/**
 * `null` au rendu serveur ET au premier rendu du navigateur, qui doivent
 * produire le même balisage. React relit l'instantané juste après
 * l'hydratation : le rappel du raccourci apparaît alors, sans avoir fait courir
 * le moindre risque d'erreur d'hydratation.
 */
function getServerSnapshot(): ModifierKey {
  return null;
}

/**
 * Le raccourci écrit en toutes lettres, pour l'infobulle d'un bouton.
 *
 * L'infobulle dit « ⌘ + Entrée », la touche affichée dans le bouton se contente
 * de « ⌘ ↵ » : la première est lue une fois, en cherchant, la seconde est vue
 * cinquante fois par jour.
 */
export function shortcutTitle(modifier: ModifierKey, key: string) {
  return `${modifier ?? "⌘ / Ctrl"} + ${key}`;
}
