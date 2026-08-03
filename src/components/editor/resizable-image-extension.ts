import type { Attributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";

/**
 * Image de l'éditeur : celle de Tiptap, redimensionnement activé.
 *
 * Le redimensionnement à la souris (poignées aux coins bas) vient de
 * `@tiptap/extension-image` lui-même — inutile d'en écrire un : le sien gère
 * déjà le ratio, la valeur minimale, et n'écrit qu'une fois dans le document au
 * relâchement (un seul pas d'annulation pour un geste, pas un par pixel).
 *
 * La taille sort en attributs HTML `width` / `height`, ce qui est exactement la
 * bonne forme pour un email : Outlook lit ces attributs, et une largeur seule
 * (sans hauteur) laisse tous les clients mettre l'image à l'échelle en gardant
 * ses proportions. Les deux attributs traversent l'assainissement, ils sont dans
 * `EMAIL_ATTR` comme dans `ARTICLE_ATTR`.
 *
 * La seule chose ajoutée ici est la relecture d'une dimension écrite en CSS
 * (`style="width:240px"`) : une signature ou un article collé depuis un autre
 * outil ne porte souvent que celle-là, et la taille était perdue à l'ouverture.
 */

export const MIN_IMAGE_WIDTH = 24;
export const MAX_IMAGE_WIDTH = 1200;

/** Tailles proposées en un clic. Calibrées pour un email de 560 px de large. */
export const IMAGE_WIDTH_PRESETS = [
  { label: "Petite", width: 120 },
  { label: "Moyenne", width: 240 },
  { label: "Grande", width: 480 },
];

export function clampImageWidth(width: number) {
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)));
}

/**
 * Dimension en pixels portée par une balise `<img>` : l'attribut d'abord, sinon
 * le style inline. Une valeur en pourcentage est ignorée — l'éditeur ne
 * manipule que des pixels, afficher « 100 px » pour « 100 % » serait pire que
 * repartir de la taille d'origine.
 */
function parseSize(element: HTMLElement, dimension: "width" | "height") {
  const attribute = element.getAttribute(dimension);
  if (attribute) {
    const parsed = Number.parseInt(attribute, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  const styleValue = element.style[dimension];
  if (styleValue.endsWith("px")) {
    const parsed = Number.parseInt(styleValue, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export const ResizableImage = Image.extend({
  addAttributes() {
    const parent: Attributes = this.parent?.() ?? {};

    return {
      ...parent,
      // Définition d'origine conservée (rendu en attribut HTML, gestion par le
      // redimensionnement) : seule la lecture est complétée.
      width: { ...parent.width, parseHTML: (element) => parseSize(element, "width") },
      height: { ...parent.height, parseHTML: (element) => parseSize(element, "height") },
    };
  },
}).configure({
  resize: {
    enabled: true,
    // Poignées en bas seulement : en haut, elles tombent sur la ligne de texte
    // précédente et deviennent difficiles à viser.
    directions: ["bottom-right", "bottom-left"],
    minWidth: MIN_IMAGE_WIDTH,
    minHeight: MIN_IMAGE_WIDTH,
    // Un logo étiré n'est jamais ce qu'on veut.
    alwaysPreserveAspectRatio: true,
  },
});
