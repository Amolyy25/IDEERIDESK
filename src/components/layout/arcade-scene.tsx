"use client";

import { PixelBitmap, PixelSprite, PixelText } from "@/components/pixel";

/* ---------------------------------------------------------------------------
   Les sprites
   ---------------------------------------------------------------------------
   Dessinés en clair, un `1` par pixel allumé, les lignes séparées par `/`. Ce
   format se relit et se corrige dans l'éditeur, ce qu'aucun fichier d'image ne
   permet — et il ne coûte aucune requête réseau au chargement de l'application.

   Un sprite ne porte PAS sa couleur : elle est décidée au montage, plus bas. Un
   dessin monochrome peut ainsi servir deux fois, et la palette entière se relit
   d'un seul endroit. */

/** L'agent, 8 × 11. Deux poses de course : appui, puis jambes rassemblées. */
const AGENT = [
  "00111100/01111110/01111110/00111100/00011000/01111110/11111111/00111100/00111100/01100110/11000011",
  "00111100/01111110/01111110/00111100/00011000/00111110/01111110/00111100/00111100/00111100/00110110",
] satisfies [string, string];

/**
 * La couronne du ROI DES TICKETS, 14 × 3.
 *
 * Séparée du corps pour une seule raison : elle est dorée et lui ne l'est pas.
 * Un sprite ne portant qu'une teinte, découper le dessin est la façon la plus
 * simple d'en avoir deux — et la couronne est justement ce qui doit accrocher
 * l'œil en premier.
 */
const CROWN = "00010001000100/01111111111110/01111111111110";

/**
 * Le corps, 14 × 10. Deux poses : gueule ouverte, puis fermée.
 *
 * Un tas qui s'élargit vers le bas — la pile qui grossit toute seule pendant
 * qu'on est en réunion. Les yeux et la bouche sont des pixels ÉTEINTS : un creux
 * se lit mieux qu'une tache.
 */
const KING = [
  "00111111111100/00110011001100/00111111111100/00111111111100/00110000001100/00111111111100/01111111111110/01111111111110/01100000000110/01100000000110",
  "00111111111100/00110011001100/00111111111100/00111111111100/00111111111100/00111111111100/01111111111110/01111111111110/01100000000110/01100000000110",
] satisfies [string, string];

/** La réponse qu'on lui envoie dans la figure, 5 × 4. */
const REPLY = "11111/11011/10101/11111";

/** Une pile de tickets à sauter, 6 × 5. */
const STACK = "011110/111111/011110/111111/011110";

/* ---------------------------------------------------------------------------
   La palette
   ---------------------------------------------------------------------------
   Un vrai tube était monochrome, et la première version l'était aussi — mais
   posée sur une liste de tickets, une scène toute verte disparaissait dedans.
   La couleur n'est donc pas là pour faire joli : c'est ce qui sépare l'agent du
   boss, et les deux du fond. Le plateau sombre fait le reste du travail. */
const AGENT_TONE = "bg-cyan-300";
const CROWN_TONE = "bg-amber-300";
const KING_TONE = "bg-rose-500";
const REPLY_TONE = "bg-amber-200";
const STACK_TONE = "bg-emerald-500";
const HUD_TONE = "bg-emerald-200";
const LIFE_TONE = "bg-rose-400";

/* ---------------------------------------------------------------------------
   L'échelle
   ---------------------------------------------------------------------------
   Tout est exprimé en taille de pixel, et les positions verticales en sont
   déduites. Un chiffre saisi à la main quelque part et c'est un sprite qui
   flotte au-dessus du sol le jour où on agrandit les sprites. */

const AGENT_UNIT = 6;
const KING_UNIT = 7;
const KING_WIDTH = 14 * KING_UNIT;
const KING_HEIGHT = 13 * KING_UNIT;

/** Hauteur de la bande, et hauteur du sol dans cette bande. */
const STAGE_HEIGHT = 224;
const GROUND = 48;

/* ---------------------------------------------------------------------------
   La chorégraphie
   ---------------------------------------------------------------------------
   Tous les instants sont comptés depuis le montage du calque rétro, en
   millisecondes, et posés en `animation-delay`. Aucun minuteur JavaScript ne
   pilote la scène : dix secondes de `setTimeout` enchaînés dériveraient à la
   première seconde de charge, alors que les animations CSS partagent une seule
   horloge, celle du compositeur. */

/** Course d'entrée : de la gauche hors-champ jusqu'au poste de tir. */
const RUN_AT = 500;
const RUN_MS = 2200;
const RUN_FROM = -12;
const RUN_TO = 22;

/** Arrivée du boss. */
const KING_AT = 2700;
const KING_MS = 800;
const KING_AT_VW = 64;

/** Le moment où la barre de vie apparaît, et où le combat commence vraiment. */
const HUD_AT = 3500;
const FIGHT_MS = 3800;
const DEATH_AT = HUD_AT + FIGHT_MS;

/** Le HUD survit un instant au boss, puis s'efface avec lui. */
const HUD_MS = FIGHT_MS + 300;

/**
 * Les trois impacts.
 *
 * Les proportions ne sont pas choisies ici : ce sont les paliers de
 * `@keyframes arcade-hp` dans globals.css, une barre de vie ne pouvant pas
 * descendre à des instants différents de ceux où elle est touchée. Les délais en
 * sont DÉDUITS — dans l'autre sens, le moindre réglage de la chorégraphie
 * désynchroniserait les deux sans que rien ne le signale.
 */
const HIT_RATIOS = [0.295, 0.611, 0.926];
const HITS = HIT_RATIOS.map((ratio) => Math.round(HUD_AT + ratio * FIGHT_MS));

/** Vol d'une réponse, du tireur à la cible. */
const SHOT_MS = 620;
const SHOTS = HITS.map((hit) => hit - SHOT_MS);

const OUTRO_AT = 8000;

/**
 * Les obstacles du parkour, placés sous les sommets des sauts.
 *
 * Les positions sont CALCULÉES depuis les mêmes proportions que les sauts de
 * `@keyframes arcade-hop`, jamais saisies à la main. Une pile posée à l'œil à
 * côté du sommet, et l'agent la traverse — ce qui ne se lit pas comme un défaut
 * de calage mais comme un bug d'affichage.
 */
const JUMP_RATIOS = [0.45, 0.75];
const STACKS = JUMP_RATIOS.map((ratio) => RUN_FROM + ratio * (RUN_TO - RUN_FROM));

/**
 * Dix secondes de borne d'arcade, au milieu de l'écran.
 *
 * L'agent entre en courant, franchit deux piles de tickets, et le ROI DES
 * TICKETS se présente. Trois réponses envoyées, trois paliers de vie, et il
 * s'effondre — après quoi la file est vide.
 *
 * La bande est posée au CENTRE et sur un fond sombre, alors qu'une scène en bas
 * d'écran serait moins encombrante. C'est un arbitrage assumé : en bas et en
 * transparence, les sprites se noyaient dans les lignes du tableau de tickets et
 * la séquence ne se lisait pas du tout. Une blague qu'on ne voit pas ne vaut pas
 * la discrétion qu'elle achète.
 *
 * Tout reste décoratif : le calque parent est `pointer-events-none`, rien ici ne
 * retient un clic, et l'application continue de fonctionner dessous.
 */
export function ArcadeScene() {
  return (
    <div
      aria-hidden
      className="arcade-scene absolute inset-x-0 top-1/2 -translate-y-1/2"
      style={{ height: STAGE_HEIGHT }}
    >
      {/* Le plateau. C'est lui, plus que la couleur des sprites, qui rend la
          scène lisible : sans fond opaque, un pixel clair posé sur une ligne de
          tableau claire n'existe pas. */}
      <div className="absolute inset-0 border-y border-emerald-400/25 bg-black/70" />

      <div
        className={`absolute inset-x-0 h-px opacity-50 ${HUD_TONE}`}
        style={{ bottom: GROUND }}
      />

      {STACKS.map((left, index) => (
        <div key={index} className="absolute" style={{ left: `${left}vw`, bottom: GROUND }}>
          <PixelBitmap bitmap={STACK} unit={5} tone={STACK_TONE} />
        </div>
      ))}

      {/* L'agent. Deux calques imbriqués parce que la course et les sauts
          animent tous deux `transform` : sur un seul élément, la dernière
          animation déclarée écraserait l'autre. */}
      <div
        className="arcade-run absolute"
        style={{ animationDelay: `${RUN_AT}ms`, animationDuration: `${RUN_MS}ms`, bottom: GROUND }}
      >
        <div
          className="arcade-hop"
          style={{ animationDelay: `${RUN_AT}ms`, animationDuration: `${RUN_MS}ms` }}
        >
          <PixelSprite frames={AGENT} unit={AGENT_UNIT} tone={AGENT_TONE} loopMs={260} />
        </div>
      </div>

      {SHOTS.map((at, index) => (
        <div
          key={index}
          className="arcade-shot absolute"
          style={{
            animationDelay: `${at}ms`,
            animationDuration: `${SHOT_MS}ms`,
            bottom: GROUND + 34,
          }}
        >
          <PixelBitmap bitmap={REPLY} unit={4} tone={REPLY_TONE} />
        </div>
      ))}

      {/* Le boss, et ses trois calques : l'entrée déplace, la mort met à
          l'échelle, les impacts font clignoter. Trois animations sur `transform`
          et `opacity` qui se disputeraient le même élément — imbriquer est ce
          qui les laisse coexister sans se piétiner. */}
      <div
        className="arcade-king-in absolute"
        style={{
          animationDelay: `${KING_AT}ms`,
          animationDuration: `${KING_MS}ms`,
          left: `${KING_AT_VW}vw`,
          bottom: GROUND,
        }}
      >
        <div className="arcade-king-die" style={{ animationDelay: `${DEATH_AT}ms` }}>
          <div
            // Trois passages du même clignotement, à trois instants. Sans
            // remplissage : hors de sa fenêtre, une animation ne doit rien
            // imposer, sinon la dernière déclarée neutraliserait les deux autres.
            style={{ animation: HITS.map((at) => `arcade-hit 240ms ${at}ms`).join(", ") }}
          >
            <PixelBitmap bitmap={CROWN} unit={KING_UNIT} tone={CROWN_TONE} />
            <PixelSprite frames={KING} unit={KING_UNIT} tone={KING_TONE} loopMs={640} />
          </div>
        </div>
      </div>

      {/* Le nom du boss et sa barre de vie, au-dessus de lui.
          Le conteneur est de largeur NULLE et centre ses enfants : ils débordent
          alors symétriquement autour du milieu du boss, quelle que soit la
          longueur du titre. Un conteneur à la largeur du sprite forcerait le nom
          à se replier lettre par lettre. */}
      <div
        className="arcade-hud absolute flex w-0 flex-col items-center gap-2"
        style={{
          animationDelay: `${HUD_AT}ms`,
          animationDuration: `${HUD_MS}ms`,
          left: `calc(${KING_AT_VW}vw + ${KING_WIDTH / 2}px)`,
          bottom: GROUND + KING_HEIGHT + 14,
        }}
      >
        <PixelText unit={3} tone={HUD_TONE} className="w-max">
          LE ROI DES TICKETS
        </PixelText>
        <div className="relative h-2" style={{ width: KING_WIDTH }}>
          <div className="absolute inset-0 bg-white/15" />
          <div
            className={`arcade-hp absolute inset-0 origin-left ${LIFE_TONE}`}
            style={{ animationDelay: `${HUD_AT}ms`, animationDuration: `${FIGHT_MS}ms` }}
          />
        </div>
      </div>

      <div
        className="arcade-outro absolute inset-x-0 top-5 flex justify-center"
        style={{ animationDelay: `${OUTRO_AT}ms` }}
      >
        <PixelText unit={5} tone={CROWN_TONE}>
          FILE VIDEE
        </PixelText>
      </div>
    </div>
  );
}
