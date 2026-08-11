"use client";

import { useSyncExternalStore } from "react";

/**
 * L'heure courante, rafraîchie par battements — pour tout ce qui affiche un
 * temps qui s'écoule pendant qu'on le regarde (échéances SLA).
 *
 * Le point délicat est l'INSTANTANÉ : `useSyncExternalStore` compare ce que
 * renvoie `getSnapshot` d'un rendu à l'autre, et rerend tant que la valeur
 * change. Un `Date.now()` renvoyé directement, ou un objet reconstruit à chaque
 * appel, boucle donc à l'infini. L'heure est ici HORODATÉE PAR LE MINUTEUR et
 * conservée dans le module : `getSnapshot` renvoie toujours la même valeur entre
 * deux battements, et le rendu ne lit jamais l'horloge lui-même — ce qu'un
 * composant n'a pas le droit de faire, sa sortie devant dépendre de ses seules
 * entrées.
 *
 * `null` au premier rendu, des deux côtés : le serveur et le navigateur ne
 * partagent pas la même horloge, et rendre l'un puis l'autre produirait une
 * erreur d'hydratation à chaque ligne de la file. L'appelant reçoit donc `null`
 * tant que l'hydratation n'a pas eu lieu, puis un horodatage.
 *
 * Un seul minuteur pour toute la page, partagé par les abonnés : une file de
 * cinquante tickets n'a pas besoin de cinquante `setInterval` qui font le même
 * travail à la même seconde.
 */

const TICK_MS = 30_000;

let stamp: number | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  if (interval === null) {
    // Premier horodatage posé ici et non au premier rendu : `subscribe` est
    // appelé par React après le rendu, seul moment où lire l'horloge est permis.
    // React relit l'instantané juste après l'abonnement et découvre ce
    // changement, ce qui déclenche le rendu qui affiche enfin une durée.
    stamp = Date.now();
    interval = setInterval(() => {
      stamp = Date.now();
      for (const listener of listeners) listener();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot() {
  return stamp;
}

function getServerSnapshot() {
  return null;
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
