"use client";

import { useEffect, useState } from "react";
import { PixelText } from "@/components/pixel";
import { useKonamiCode } from "@/components/layout/use-konami-code";
import { ArcadeScene } from "@/components/layout/arcade-scene";

/**
 * Durée du mode rétro, en millisecondes. Doit rester alignée sur l'animation
 * `retro-crt` de globals.css : c'est ce minuteur qui démonte le calque, pas la
 * fin de l'animation — qui n'existe pas sous `prefers-reduced-motion`.
 */
const RETRO_MS = 10_000;

/**
 * Dix secondes de tube cathodique.
 *
 * Le calque ne fait que RECOUVRIR : `pointer-events-none` et aucun filtre posé
 * sur l'application elle-même. Ce n'est pas un détail de mise en œuvre, c'est ce
 * qui rend la blague acceptable dans un outil de travail — pendant les dix
 * secondes, tout reste cliquable, lisible et fonctionnel dessous. Un agent
 * surpris en plein traitement d'un ticket ne perd rien.
 *
 * (Un `filter` posé sur la racine aurait donné une teinte plus franche, mais il
 * crée un bloc conteneur : les menus et boîtes de dialogue en `position: fixed`
 * se seraient recalés de travers. Un calque par-dessus n'a pas cet effet de
 * bord.)
 */
export function RetroMode() {
  // Un compteur plutôt qu'un booléen : rejouer la séquence pendant que le mode
  // est déjà actif change la valeur, ce qui remonte le calque et relance les dix
  // secondes. Avec un booléen, `setActive(true)` sur `true` ne ferait rien.
  const [run, setRun] = useState(0);

  useKonamiCode(() => setRun((previous) => previous + 1));

  useEffect(() => {
    if (run === 0) return;
    const timer = setTimeout(() => setRun(0), RETRO_MS);
    return () => clearTimeout(timer);
  }, [run]);

  if (run === 0) return null;

  return (
    <div
      // `key` force le remontage à chaque déclenchement : sans lui, rejouer la
      // séquence prolongerait le minuteur sans rejouer l'allumage de l'écran.
      key={run}
      aria-hidden
      className="retro-crt pointer-events-none fixed inset-0 z-[9999]"
    >
      {/* La teinte phosphore. Volontairement pâle : elle doit se voir sans
          empêcher de lire un nom de client par-dessus. */}
      <div className="absolute inset-0 bg-emerald-400/12" />

      {/* La scène est posée AVANT les lignes de balayage, donc en dessous :
          c'est ce qui la fait passer derrière le verre du tube au lieu d'être
          collée sur l'écran. Un sprite que le balayage ne traverse pas sort du
          décor. */}
      <ArcadeScene />

      {/* Remonté en haut à droite : le centre appartient désormais au combat, et
          deux choses qui clignotent au même endroit ne se lisent plus ni l'une
          ni l'autre. */}
      <div className="absolute top-5 right-5">
        <PixelText unit={3} tone="bg-emerald-300/70">
          INSERT COIN
        </PixelText>
      </div>

      {/* Les lignes de balayage, dessinées en dégradé répété plutôt qu'en image :
          elles suivent la résolution de l'écran au lieu d'être rééchantillonnées. */}
      <div className="retro-scanlines absolute inset-0" />

      {/* La barre de rafraîchissement qui descend lentement. C'est elle, plus que
          les lignes fixes, qui fait « tube cathodique » plutôt que « filtre ». */}
      <div className="retro-sweep absolute inset-x-0 top-0" />

      {/* Le bord assombri : un écran courbe perd de la lumière dans les angles. */}
      <div className="retro-vignette absolute inset-0" />
    </div>
  );
}
