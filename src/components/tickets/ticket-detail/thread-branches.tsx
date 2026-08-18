import { Merge } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { MergedTicket, TicketWithMessages } from "@/lib/actions/tickets";
import { cn } from "@/lib/utils";
import { Timeline, type TimelineAlign } from "@/components/tickets/ticket-detail/timeline-item";
import { SeparateButton } from "@/components/tickets/ticket-detail/merged-tickets";

// Mise en page des conversations parallèles d'un ticket ayant absorbé des
// doublons : une colonne par demande d'origine, et le raccord qui les relie à la
// colonne commune. Voir `TicketThread` pour le sens de lecture de l'ensemble.

/**
 * Une conversation, de son ouverture jusqu'à la fusion.
 *
 * Le repère de colonne est en pied et non en tête : dans un fil qui se lit à
 * rebours, une branche commence en bas. Le placer au-dessus l'aurait mis entre
 * le raccord et le premier message de la colonne, coupant le rail à l'endroit
 * précis où il doit se voir descendre d'une conversation vers l'autre.
 */
export function BranchColumn({
  align,
  footer,
  children,
}: {
  align: TimelineAlign;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {/* `before:top-0` : le rail part du haut de la colonne pour prolonger le
          raccord, au lieu de commencer au premier message. */}
      <Timeline align={align} className="mb-2 before:top-0">
        {children}
      </Timeline>
      {footer}
    </div>
  );
}

export function OwnBranchHeader({
  ticket,
  isCurrent,
}: {
  ticket: TicketWithMessages;
  isCurrent: boolean;
}) {
  return (
    <BranchHeader
      align="left"
      number={ticket.number}
      clientName={ticket.client?.name ?? null}
      fallbackLabel="Demande d'origine"
      isCurrent={isCurrent}
    />
  );
}

export function DuplicateBranchHeader({
  duplicate,
  canMerge,
  isCurrent,
}: {
  duplicate: MergedTicket;
  canMerge: boolean;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {canMerge && <SeparateButton ticketId={duplicate.id} className="h-6 px-2 text-xs" />}
      {/* Inutile de proposer d'ouvrir la page où l'on se trouve déjà. */}
      {!isCurrent && (
        <Link
          href={`/tickets/${duplicate.id}`}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Ouvrir
        </Link>
      )}
      <BranchHeader
        align="right"
        number={duplicate.number}
        clientName={duplicate.client?.name ?? null}
        fallbackLabel="Doublon fusionné"
        isDuplicate
        isCurrent={isCurrent}
      />
    </div>
  );
}

/**
 * Qui parle dans cette colonne : sans ce repère, deux fils côte à côte se
 * confondent.
 *
 * `isCurrent` marque la colonne correspondant à l'adresse ouverte. C'est ce qui
 * permet d'arriver depuis un doublon sans se perdre : le dossier entier
 * s'affiche, et l'agent voit immédiatement par quelle porte il est entré.
 */
function BranchHeader({
  align,
  number,
  clientName,
  fallbackLabel,
  isDuplicate = false,
  isCurrent,
}: {
  align: TimelineAlign;
  number: number;
  clientName: string | null;
  fallbackLabel: string;
  isDuplicate?: boolean;
  isCurrent: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        align === "right" && "justify-end"
      )}
    >
      <Badge variant="outline" className="gap-1.5 text-[11px] font-normal">
        {isDuplicate && <Merge className="size-3" />}#{number}
      </Badge>
      <span className="truncate text-xs font-medium">{clientName ?? fallbackLabel}</span>
      {isCurrent && (
        <Badge variant="secondary" className="text-[11px] font-normal">
          Vous êtes ici
        </Badge>
      )}
    </div>
  );
}

/** Gouttière horizontale de la grille des branches (`gap-x-6`), en rem. */
const BRANCH_GAP_REM = 1.5;

/** Écart entre le bord d'une colonne et son rail — la moitié d'une pastille (`left-4`). */
const RAIL_INSET_REM = 1;

/**
 * Le raccord : le rail unique de la colonne commune, en haut, se sépare en
 * autant de branches qu'il y a de conversations d'origine en dessous.
 *
 * Le tracé suit le sens de lecture du fil, à rebours du temps : la fusion se lit
 * donc de haut en bas comme une séparation. C'est le même événement vu par
 * l'autre bout, et le seul dessin qui ne fasse pas remonter un trait à
 * contresens du reste de la page.
 *
 * Tracé en bordures plutôt qu'en SVG : la position d'un rail dépend de la
 * largeur réelle des colonnes, que seul le navigateur connaît. Un `calc()` la
 * suit à chaque redimensionnement, là où un SVG à coordonnées fixes se
 * décalerait dès que le panneau latéral change de largeur.
 */
export function ConfluenceBand({ branchCount }: { branchCount: number }) {
  const columns = branchCount + 1;

  return (
    <div aria-hidden className="relative hidden h-10 md:block">
      {/* Le rail du ticket, qui traverse sans dévier : c'est le dossier qui reste. */}
      <span className="absolute top-0 bottom-0 left-4 w-px bg-border" />

      {/* Bordures haute et droite : le trait quitte le rail de gauche à hauteur
          du dernier message commun, file vers la colonne de la branche, puis
          vire vers le bas pour y descendre. */}
      {Array.from({ length: branchCount }, (_, index) => (
        <span
          key={index}
          style={{ right: railOffsetFromRight(index + 1, columns) }}
          className="absolute top-0 bottom-0 left-4 rounded-tr-xl border-t border-r border-border"
        />
      ))}
    </div>
  );
}

/**
 * Distance entre le bord droit du fil et le rail de la colonne `columnIndex`.
 *
 * Les gouttières comptent : à trois colonnes, les ignorer décalait le raccord
 * d'un demi-`rem` et le trait arrivait à côté du rail qu'il devait rejoindre.
 * La largeur d'une colonne est donc reconstruite comme le fait la grille
 * elle-même — largeur totale moins les gouttières, divisée par le nombre de
 * colonnes.
 */
function railOffsetFromRight(columnIndex: number, columns: number) {
  const gapsTotal = `${(columns - 1) * BRANCH_GAP_REM}rem`;
  const columnWidth = `((100% - ${gapsTotal}) / ${columns})`;
  const rightEdge = `(${columnIndex + 1} * ${columnWidth} + ${columnIndex * BRANCH_GAP_REM}rem)`;

  return `calc(100% - ${rightEdge} + ${RAIL_INSET_REM}rem)`;
}
