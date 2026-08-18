import { formatDateTime } from "@/lib/format-date";
import { RelativeTime } from "@/components/tickets/relative-time";
import { cn } from "@/lib/utils";

/**
 * Une entrée du fil : pastille d'auteur sur la ligne de temps, puis la carte du
 * message.
 *
 * Composant partagé par la demande initiale (rendue côté serveur) et par les
 * réponses (rendues côté client) : les deux sont des tours de la même
 * conversation, les afficher différemment obligeait à relire l'en-tête de chaque
 * bloc pour savoir lequel était lequel.
 */

/**
 * Sens de circulation du message. Le ton porte l'information : reçu, envoyé, ou
 * jamais sorti de l'équipe.
 */
export type TimelineTone = "inbound" | "outbound" | "internal";

/**
 * Côté où court la ligne de temps.
 *
 * `right` ne sert qu'aux conversations parallèles d'un ticket ayant absorbé des
 * doublons : la demande d'origine descend à gauche, celle du doublon à droite,
 * et les deux se rejoignent plus bas. Un fil ordinaire n'utilise que `left`.
 */
export type TimelineAlign = "left" | "right";

const TONE_CLASS: Record<TimelineTone, string> = {
  inbound: "border-border bg-muted/40",
  outbound: "border-border bg-card",
  internal: "border-primary/30 bg-primary/5",
};

export function TimelineItem({
  avatar,
  author,
  meta,
  date,
  tone,
  align = "left",
  anchorId,
  children,
  footer,
}: {
  avatar: React.ReactNode;
  author: string;
  /** Étiquettes qui qualifient le message (note interne, envoi, validation…). */
  meta?: React.ReactNode;
  date: Date;
  tone: TimelineTone;
  align?: TimelineAlign;
  /** Cible des liens qui renvoient à cette entrée (citations, cloche). */
  anchorId?: string;
  children: React.ReactNode;
  /** Zone d'actions en pied de carte, séparée du contenu. */
  footer?: React.ReactNode;
}) {
  return (
    <li
      id={anchorId}
      className={cn(
        "relative flex gap-3",
        align === "right" && "flex-row-reverse",
        // L'en-tête de la fiche est collant : sans marge de défilement, une carte
        // atteinte par son ancre s'arrête dessous.
        anchorId && "scroll-mt-24"
      )}
    >
      {/* Fond opaque derrière la pastille : c'est ce qui interrompt la ligne de
          temps au niveau de chaque auteur, sans la découper en segments. */}
      <div className="relative z-10 shrink-0 bg-background py-0.5">{avatar}</div>

      <div className={cn("min-w-0 flex-1 rounded-lg border", TONE_CLASS[tone])}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3">
          <span className="text-sm font-medium">{author}</span>
          {meta}
          {/* L'heure relative se lit d'un coup d'œil ; la date exacte reste
              accessible au survol, elle n'a pas besoin d'occuper la ligne. */}
          <span className="ml-auto shrink-0" title={formatDateTime(date)}>
            <RelativeTime date={date} className="text-xs text-muted-foreground" />
          </span>
        </div>

        <div className="px-4 pt-1.5 pb-3">{children}</div>

        {footer && <div className="border-t px-4 py-2.5">{footer}</div>}
      </div>
    </li>
  );
}

/**
 * Événement de service (accusé de réception envoyé, échec d'envoi…).
 *
 * Volontairement pas une carte : ces lignes racontent ce que l'application a
 * fait, pas ce que quelqu'un a écrit. En carte, elles pesaient autant qu'une
 * réponse au client et hachaient la lecture du fil.
 */
export function TimelineEvent({
  children,
  date,
  align = "left",
}: {
  children: React.ReactNode;
  date: Date;
  align?: TimelineAlign;
}) {
  return (
    <li
      className={cn("relative flex items-center gap-3", align === "right" && "flex-row-reverse")}
    >
      <div className="relative z-10 flex size-8 shrink-0 items-center justify-center bg-background">
        <span className="size-1.5 rounded-full bg-border ring-3 ring-background" />
      </div>
      <p className="min-w-0 text-xs text-muted-foreground">
        {children}
        <span className="px-1.5 text-muted-foreground/50">·</span>
        <span title={formatDateTime(date)}>
          <RelativeTime date={date} className="text-xs text-muted-foreground" />
        </span>
      </p>
    </li>
  );
}

/**
 * La ligne de temps elle-même. Le trait vertical est posé en pseudo-élément sur
 * la liste : il relie les entrées sans qu'aucune n'ait à connaître ses voisines.
 */
export function Timeline({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: TimelineAlign;
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "relative flex flex-col gap-3 before:absolute before:top-4 before:bottom-4 before:w-px before:bg-border",
        align === "right" ? "before:right-4" : "before:left-4",
        className
      )}
    >
      {children}
    </ol>
  );
}
