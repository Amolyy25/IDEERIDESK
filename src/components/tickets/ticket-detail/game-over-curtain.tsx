"use client";

import { PixelText } from "@/components/pixel";

/**
 * Combien de temps le rideau reste en place, en millisecondes.
 *
 * Exporté parce que c'est un minuteur, côté React, qui le démonte : la fin d'une
 * animation CSS ne peut pas servir de signal ici, il y en a deux cent quarante
 * qui se terminent à des instants différents — et aucune sous
 * `prefers-reduced-motion`. La valeur couvre le tout : le dernier pixel touche
 * le fond vers 3,7 s, le titre est là depuis 2,6 s, la ligne du bas depuis
 * 3,3 s, et le fondu de sortie programmé en CSS s'achève à 5,42 s.
 *
 * Cinq secondes et demie assumées. Ce n'est pas une transition, c'est une
 * séquence qu'on regarde — et elle ne se déclenche qu'en écrivant une insulte
 * dans une réponse client, autant dire jamais.
 */
export const GAME_OVER_MS = 5450;

/**
 * La grille de décomposition. Vingt-quatre par dix, et pas davantage : chaque
 * case est un élément animé, donc une couche composée par le GPU. À quatre
 * cents et plus, la chute commence à sauter sur les postes d'agence, ce qui
 * ruine exactement l'effet recherché.
 */
const COLUMNS = 24;
const ROWS = 10;
const TOTAL = COLUMNS * ROWS;

/** Le premier pixel ne part qu'après ce délai : le temps de VOIR le formulaire
 *  devenir une mosaïque avant qu'elle ne s'effondre. Sans cette pause, la
 *  transformation et la chute se confondent en un seul mouvement flou. */
const FIRST_FALL_MS = 420;

/**
 * Écart entre deux départs. `1 par 1`, littéralement.
 *
 * Neuf millisecondes, soit près de deux secondes et demie pour vider la grille.
 * Le premier réglage était trois fois plus serré, et c'était l'erreur : à ce
 * rythme les cases partent par paquets, et l'œil voit une vague balayer le bloc
 * au lieu de pixels qui se détachent un par un.
 */
const FALL_STEP_MS = 9;

/**
 * Le formulaire se décompose.
 *
 * Trois plans empilés : le vide (noir, tout au fond), la mosaïque qui le
 * recouvre entièrement au premier instant, et le texte. Le vide n'a pas besoin
 * d'apparaître — il se découvre à mesure que les pixels tombent, ce qui est
 * exactement ce qu'on veut donner à lire.
 */
export function GameOverCurtain({ word }: { word: string }) {
  return (
    <div className="reply-curtain absolute inset-0 z-20 overflow-hidden bg-black">
      {/* La seule version qui compte pour un lecteur d'écran : ce qui vient de
          se passer, et surtout que RIEN n'est parti. Les pixels, eux, ne
          racontent rien à qui ne les voit pas. */}
      <p role="status" className="sr-only">
        Envoi interrompu : le mot « {word} » a été détecté dans votre message. Rien n&apos;a
        été envoyé. Cliquez de nouveau sur Envoyer pour passer outre.
      </p>

      <div
        aria-hidden
        className="absolute inset-0 grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: TOTAL }, (_, index) => {
          const column = index % COLUMNS;
          const row = Math.floor(index / COLUMNS);

          return (
            <span
              key={index}
              className={`reply-pixel-fall ${pixelTone(column, row)}`}
              style={
                {
                  animationDelay: `${FIRST_FALL_MS + fallOrder(index) * FALL_STEP_MS}ms`,
                  // Une dérive latérale propre à chaque case : une chute
                  // strictement verticale se lit comme un rideau qui descend,
                  // alors que des trajectoires légèrement divergentes se lisent
                  // comme des morceaux qui se détachent.
                  "--pixel-drift": `${((index * 61) % 21) - 10}px`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4">
        <PixelText unit={6} tone="bg-red-500" className="reply-gameover-in">
          GAME OVER
        </PixelText>
        <PixelText unit={3} tone="bg-neutral-300" className="reply-gameover-sub">
          {`VOUS AVEZ DIT ${word}`}
        </PixelText>
      </div>
    </div>
  );
}

/**
 * Dans quel ordre une case tombe.
 *
 * Le pas est premier avec le nombre de cases, donc la suite les parcourt toutes
 * exactement une fois : chaque pixel tombe, aucun deux fois. L'ordre paraît
 * aléatoire sans l'être — et n'a donc pas besoin de `Math.random()`, qui
 * donnerait un rendu différent à chaque déclenchement pour un gain nul.
 */
function fallOrder(index: number) {
  return (index * 149) % TOTAL;
}

/**
 * La couleur d'une case, déduite de sa position.
 *
 * Le formulaire n'est pas rasterisé — il faudrait une bibliothèque pour ça, et
 * une image du DOM à chaque envoi raté. Ce qu'on reconstitue, c'est sa SILHOUETTE
 * : une barre d'outils en haut, des lignes de texte au milieu, le bouton
 * d'envoi en bas à droite. C'est assez pour que la mosaïque se lise comme « le
 * formulaire, en pixels » et non comme un damier posé dessus.
 *
 * Toutes les teintes sont OPAQUES. Une couleur translucide laisserait passer le
 * noir du vide placé derrière, et la mosaïque serait criblée de trous avant même
 * que le premier pixel ne tombe.
 */
function pixelTone(column: number, row: number) {
  if (row >= ROWS - 2 && column >= COLUMNS - 5) return "bg-primary";
  if (row === 0) return "bg-muted";
  if (row >= 2 && row <= 6 && column < COLUMNS - 3 && (column + row * 2) % 4 !== 0) {
    return "bg-border";
  }
  return "bg-card";
}
