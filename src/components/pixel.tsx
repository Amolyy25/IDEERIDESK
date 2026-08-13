/**
 * Une police bitmap 5 × 7, dessinée en dur.
 *
 * Aucun fichier de police n'est chargé, et ce n'est pas une économie de bouts de
 * chandelle : une police pixel de vingt kilo-octets téléchargée pour une blague
 * que la plupart des agents ne verront jamais serait payée par tous, tout le
 * temps. Ici le coût est de quelques lignes de constantes, envoyées avec le
 * reste du composant.
 *
 * Le rendu en carrés a aussi un avantage que n'aurait aucune police : les
 * lettres sont faites de la même matière que le formulaire qui vient de se
 * décomposer. C'est ce qui relie les deux moitiés de l'animation.
 */

/**
 * Un « 1 » par pixel allumé, les lignes séparées par `/`, de haut en bas.
 *
 * L'alphabet est complet alors que trois mots suffiraient : cette police doit
 * pouvoir écrire l'insulte du jour, et la liste surveillée est faite pour
 * s'allonger. Une lettre manquante ferait un trou au milieu du GAME OVER.
 */
const GLYPHS: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001",
  B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01110/10001/10000/10000/10000/10001/01110",
  D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111",
  F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01110/10001/10000/10111/10001/10001/01111",
  H: "10001/10001/10001/11111/10001/10001/10001",
  I: "11111/00100/00100/00100/00100/00100/11111",
  J: "00111/00010/00010/00010/00010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001",
  L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001",
  N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110",
  P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101",
  R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110",
  T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110",
  V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/11011/10001",
  X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100",
  Z: "11111/00001/00010/00100/01000/10000/11111",
  "!": "00100/00100/00100/00100/00100/00000/00100",
  " ": "00000/00000/00000/00000/00000/00000/00000",
};

/**
 * Écrit un texte en pixels.
 *
 * `unit` est la taille d'un pixel, en points d'écran : c'est le seul réglage,
 * tout le reste en découle. Les caractères inconnus deviennent une espace plutôt
 * que de faire échouer le rendu — un accent oublié ne doit pas casser la page en
 * plein easter egg.
 */
export function PixelText({
  children,
  unit,
  tone,
  className,
}: {
  children: string;
  unit: number;
  /** Classe de fond des pixels allumés, par exemple `bg-red-500`. */
  tone: string;
  className?: string;
}) {
  return (
    <span
      // Le texte est déjà lisible ailleurs (voir le `role="status"` du rideau) :
      // annoncer en plus une suite de carrés vides n'apporterait rien.
      aria-hidden
      className={`flex flex-wrap items-start justify-center ${className ?? ""}`}
      // L'espacement entre lettres est exprimé en pixels de la police, pas en
      // rem : à l'agrandissement, les lettres et leurs écarts doivent grossir
      // ensemble, sinon le mot se disloque.
      style={{ columnGap: unit * 2, rowGap: unit * 3 }}
    >
      {[...children.toUpperCase()].map((character, index) => (
        <PixelBitmap key={index} bitmap={GLYPHS[character] ?? GLYPHS[" "]} unit={unit} tone={tone} />
      ))}
    </span>
  );
}

/**
 * Un dessin, allumé pixel par pixel.
 *
 * Une lettre de la police et une image de sprite sont exactement la même chose —
 * une grille de « 1 » et de « 0 » — et n'ont donc qu'un seul rendu. Le format est
 * volontairement lisible en clair dans le code : un sprite qu'on ne peut pas
 * relire est un sprite qu'on ne peut pas corriger.
 */
export function PixelBitmap({
  bitmap,
  unit,
  tone,
  className,
}: {
  /** Les lignes, de haut en bas, séparées par `/`. Un `1` par pixel allumé. */
  bitmap: string;
  unit: number;
  tone: string;
  className?: string;
}) {
  const rows = bitmap.split("/");

  return (
    <span
      className={`grid ${className ?? ""}`}
      style={{
        gridTemplateColumns: `repeat(${rows[0].length}, ${unit}px)`,
        gridAutoRows: `${unit}px`,
      }}
    >
      {rows.flatMap((row, y) =>
        [...row].map((bit, x) => (
          <span key={`${y}-${x}`} className={bit === "1" ? tone : undefined} />
        ))
      )}
    </span>
  );
}

/**
 * Un sprite à deux images, qui alterne indéfiniment.
 *
 * Deux images et pas davantage, sciemment : une course, un vol d'oiseau ou une
 * respiration se lisent parfaitement en deux poses — c'est la base du sprite
 * 8 bits — et la limite garde le mécanisme entier dans une seule règle CSS.
 *
 * Les deux images sont superposées et c'est l'opacité qui bascule, jamais le
 * montage : remonter un élément à chaque image confierait la cadence au rythme
 * de rendu de React, qui n'en a aucune. Ici c'est le compositeur qui la tient.
 * La seconde image démarre avec un retard NÉGATIF d'une demi-boucle, ce qui la
 * place d'emblée en seconde moitié de cycle — sans quoi les deux poses
 * s'afficheraient ensemble au premier passage.
 */
export function PixelSprite({
  frames,
  unit,
  tone,
  loopMs,
  className,
}: {
  frames: [string, string];
  unit: number;
  tone: string;
  loopMs: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      {frames.map((frame, index) => (
        <span
          key={index}
          className={index === 0 ? "pixel-frame" : "pixel-frame absolute inset-0"}
          style={{
            animationDuration: `${loopMs}ms`,
            animationDelay: `-${(index * loopMs) / 2}ms`,
          }}
        >
          <PixelBitmap bitmap={frame} unit={unit} tone={tone} />
        </span>
      ))}
    </span>
  );
}
