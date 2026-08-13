/**
 * Le jingle de défaite qui accompagne le GAME OVER.
 *
 * Synthétisé à la volée, et non joué depuis un fichier. Deux raisons, dans cet
 * ordre : le jingle de mort de Mario est une composition protégée, qu'on ne
 * copie pas dans un produit vendu à des agences ; et un asset audio serait un
 * fichier de plus à charger sur une page qu'on ouvre trois cents fois par jour.
 *
 * Ce qui est repris, c'est l'IDIOME et non la mélodie : ondes carrées, chute
 * chromatique puis arpège descendant, filtre passe-bas pour arrondir les
 * harmoniques criardes du carré. C'est ce vocabulaire-là qu'on reconnaît comme
 * « perdu », pas les notes exactes.
 */

/**
 * `[fréquence en Hz, départ en secondes, durée en secondes]`.
 *
 * Le découpage est calé sur l'animation, pas choisi pour lui-même : le
 * trébuchement couvre la pause pendant laquelle le formulaire se change en
 * mosaïque, la chute démarre au moment où le premier pixel se détache (0,42 s),
 * et la note finale tient assez longtemps pour ne pas laisser les pixels tomber
 * dans le silence. Un jingle qui s'arrête pendant que l'image bouge encore
 * transforme le reste de la séquence en bug.
 */
const NOTES: Array<[number, number, number]> = [
  // Le trébuchement : trois demi-tons descendants, serrés.
  [392.0, 0.0, 0.16],
  [369.99, 0.16, 0.16],
  [349.23, 0.32, 0.16],
  // La chute : un arpège qui s'effondre, chaque note plus longue que la
  // précédente — c'est ce ralentissement qui fait « c'est fini ».
  [261.63, 0.54, 0.22],
  [220.0, 0.76, 0.24],
  [174.61, 1.0, 1.3],
];

/**
 * Volume de crête. Volontairement bas : c'est un back-office qu'on utilise en
 * open space, et une blague qui fait se retourner les collègues ne se supporte
 * qu'une fois.
 */
const PEAK_GAIN = 0.06;

export function playGameOverJingle() {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;

  let context: AudioContext;
  try {
    context = new AudioCtor();
  } catch {
    // Un navigateur qui refuse d'ouvrir un contexte audio n'a aucune raison de
    // faire échouer l'envoi : l'easter egg est muet, et c'est tout.
    return;
  }

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.connect(context.destination);

  // Le petit décalage laisse au contexte le temps de démarrer : programmer une
  // note à `currentTime` exactement la fait parfois commencer en cours de route,
  // ce qui s'entend comme un clic.
  const start = context.currentTime + 0.03;

  for (const [frequency, offset, duration] of NOTES) {
    const at = start + offset;

    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, at);

    // Enveloppe par note. L'attaque et l'extinction ne sont pas cosmétiques :
    // une onde carrée démarrée ou coupée net produit un claquement, bien plus
    // audible que la note elle-même.
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.012);
    gain.gain.setValueAtTime(PEAK_GAIN, at + duration * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    oscillator.connect(gain).connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  // Un contexte audio est une ressource système, et les navigateurs en limitent
  // le nombre par onglet : sans fermeture, une session d'après-midi bien
  // taquine finirait par ne plus rien pouvoir jouer du tout.
  window.setTimeout(() => void context.close(), 3200);
}
