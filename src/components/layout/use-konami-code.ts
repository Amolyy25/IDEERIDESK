"use client";

import { useEffect, useRef } from "react";

/**
 * La séquence, inchangée depuis 1986.
 *
 * Elle n'est pas choisie pour sa discrétion mais pour l'inverse : c'est la seule
 * suite de touches que quelqu'un puisse essayer SANS qu'on la lui ait dite. Une
 * séquence inventée serait discrète au point de n'être jamais trouvée — ce qui
 * n'est pas un easter egg, juste du code mort.
 *
 * La discrétion, elle, est dans les trois gardes ci-dessous.
 */
const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * Au-delà de ce silence entre deux touches, le compteur repart de zéro.
 *
 * GARDE N° 2, et la moins évidente. Sans elle, la séquence ne serait pas un
 * geste mais une accumulation : deux ↑ en parcourant la file le matin, deux ↓
 * en revenant de réunion, et le code finirait par s'assembler tout seul au bout
 * d'une journée. Le délai est ce qui exige qu'on la JOUE.
 */
const RESET_AFTER_MS = 1200;

/**
 * À partir de combien de touches justes on confisque le défilement.
 *
 * GARDE N° 3. Avant ce seuil l'intention est ambiguë et les flèches doivent
 * continuer à faire défiler la page normalement — les confisquer plus tôt
 * casserait la navigation au clavier de toute l'application pour une blague.
 * Passé trois touches exactes d'affilée, elle ne l'est plus, et la page arrête
 * de sauter sous celui qui est en train de jouer la séquence.
 */
const SWALLOW_FROM = 3;

/**
 * Écoute la séquence sur toute la fenêtre.
 *
 * `onUnlock` est gardée dans une référence : le rappel est presque toujours
 * réécrit à chaque rendu du composant appelant, et le passer en dépendance
 * ferait détacher puis rattacher l'écouteur — en perdant la progression en
 * cours à chaque fois.
 */
export function useKonamiCode(onUnlock: () => void) {
  const unlock = useRef(onUnlock);
  // Rafraîchie dans un effet et non pendant le rendu : écrire dans une référence
  // en cours de rendu est ce qui rend un composant impossible à rejouer à
  // l'identique, et React le signale comme tel.
  useEffect(() => {
    unlock.current = onUnlock;
  }, [onUnlock]);

  const progress = useRef(0);
  const lastKeyAt = useRef(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Une combinaison avec modificateur est un raccourci, pas une flèche.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        progress.current = 0;
        return;
      }

      // GARDE N° 1, la seule vraiment indispensable : dans un champ, une zone de
      // texte ou l'éditeur de réponse, les flèches servent à se déplacer dans le
      // texte. Un agent qui relit sa réponse en la parcourant aux flèches ne doit
      // jamais faire apparaître quoi que ce soit.
      if (isTyping(event.target)) {
        progress.current = 0;
        return;
      }

      // `timeStamp` est compté depuis l'ouverture de la page et ne recule pas :
      // il mesure un délai sans dépendre de l'heure du poste.
      if (event.timeStamp - lastKeyAt.current > RESET_AFTER_MS) {
        progress.current = 0;
      }
      lastKeyAt.current = event.timeStamp;

      // Les lettres sont comparées en minuscules, les touches nommées telles
      // quelles : « B » avec la majuscule verrouillée reste un B.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (key !== SEQUENCE[progress.current]) {
        // Une touche fausse ne renvoie pas forcément à zéro : celle qu'on vient
        // de taper peut être le premier pas d'un nouvel essai. Sans ça, un
        // ↑ ↑ ↑ ↓ hésitant ne pourrait jamais aboutir.
        progress.current = key === SEQUENCE[0] ? 1 : 0;
        return;
      }

      progress.current += 1;
      if (progress.current >= SWALLOW_FROM) event.preventDefault();

      if (progress.current === SEQUENCE.length) {
        progress.current = 0;
        unlock.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/** Le focus est-il dans quelque chose où l'on écrit ? */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  // `isContentEditable` couvre l'éditeur de réponse : ProseMirror ne rend ni un
  // `input` ni un `textarea`, un test sur les balises seules le manquerait.
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
