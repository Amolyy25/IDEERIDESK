"use client";

import { Reply, Save, Wand2 } from "lucide-react";
import { formatTimeOfDay } from "@/lib/format-date";

// Les lignes d'annonce autour du champ : d'où vient le texte affiché, et comment
// s'en débarrasser. Même gabarit pour toutes, elles occupent la même place.

/** Le champ a été pré-rempli par une réponse type. */
export function PrefilledNotice({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <NoticeLine
      icon={<Wand2 className="size-3.5 shrink-0" />}
      action="Effacer"
      onAction={onClear}
    >
      Brouillon <Strong>« {title} »</Strong>, à relire avant l&apos;envoi.
    </NoticeLine>
  );
}

/** Le champ répond à une note interne, dont l'extrait est rappelé ici. */
export function ReplyingToNotice({
  author,
  excerpt,
  onClear,
}: {
  author: string;
  excerpt: string;
  onClear: () => void;
}) {
  return (
    <NoticeLine
      icon={<Reply className="size-3.5 shrink-0 text-primary" />}
      action="Ne plus citer"
      onAction={onClear}
    >
      En réponse à <Strong>{author}</Strong> · « {excerpt} »
    </NoticeLine>
  );
}

/** Un brouillon local a été retrouvé à l'ouverture du ticket. */
export function RestoredDraftNotice({
  savedAt,
  onDiscard,
}: {
  savedAt: number | null;
  onDiscard: () => void;
}) {
  return (
    <NoticeLine
      icon={<Save className="size-3.5 shrink-0" />}
      action="Repartir de zéro"
      onAction={onDiscard}
    >
      Brouillon retrouvé{savedAt ? ` (${formatTimeOfDay(savedAt)})` : ""}, à relire avant
      l&apos;envoi.
    </NoticeLine>
  );
}

/** L'IA vient de remplacer le texte du champ, et le retour arrière est encore offert. */
export function AiEditNotice({
  label,
  previousWasEmpty,
  onUndo,
}: {
  label: string;
  /** Le champ était vide avant : « revenir à ma version » n'aurait aucun sens. */
  previousWasEmpty: boolean;
  onUndo: () => void;
}) {
  return (
    <NoticeLine
      icon={<Wand2 className="size-3.5 shrink-0 text-primary" />}
      action={previousWasEmpty ? "Effacer" : "Revenir à ma version"}
      onAction={onUndo}
    >
      Retouché par l&apos;IA <Strong>« {label} »</Strong>, à relire avant l&apos;envoi.
    </NoticeLine>
  );
}

// « Ce navigateur » est dit explicitement : le brouillon est en stockage local et ne
// suit pas l'agent d'un poste à l'autre.
export function DraftStatus({ savedAt }: { savedAt: number | null }) {
  if (savedAt === null) return null;

  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Save className="size-3.5 shrink-0" />
      Brouillon enregistré à {formatTimeOfDay(savedAt)} sur ce navigateur
    </p>
  );
}

function NoticeLine({
  icon,
  action,
  onAction,
  children,
}: {
  icon: React.ReactNode;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    // Une seule ligne, texte tronqué au besoin : l'extrait d'une note citée peut
    // être long, et le replier renvoyait le bouton d'à côté sous le texte.
    <p className="flex items-center gap-x-1.5 text-xs text-muted-foreground">
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 underline underline-offset-2 hover:text-foreground"
      >
        {action}
      </button>
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}
