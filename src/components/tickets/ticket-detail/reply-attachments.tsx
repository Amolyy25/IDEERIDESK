"use client";

import { useState, useRef } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_ATTACHMENTS, REPLY_ALLOWED_ATTACHMENT_TYPES } from "@/lib/attachment-rules";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${Math.round(bytes / 1024)} Ko`;
}

// `types` et non `items` : pendant le survol, le navigateur masque le contenu du
// presse-papier de glissement et ne laisse lire que les types annoncés. Sans ce
// test, glisser du texte SÉLECTIONNÉ DANS L'ÉDITEUR ouvrirait la zone de dépôt.
function carriesFiles(event: React.DragEvent) {
  return event.dataTransfer.types.includes("Files");
}

// Le corps du formulaire, transformé en cible de dépôt. Gestionnaires en phase
// de CAPTURE avec propagation coupée : sinon l'éditeur riche voit le fichier
// avant nous et le navigateur finit par l'ouvrir dans l'onglet, brouillon perdu.
export function ReplyDropZone({
  disabled,
  className,
  onDrop,
  children,
}: {
  disabled: boolean;
  className?: string;
  onDrop: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn("relative", className)}
      onDragOverCapture={(event) => {
        if (disabled || !carriesFiles(event)) return;
        // Sans `preventDefault` sur le survol, le navigateur refuse le dépôt.
        event.preventDefault();
        event.stopPropagation();
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        // Survoler un enfant émet un `dragleave` : ne se referme que si le
        // curseur a réellement quitté la zone.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsOver(false);
      }}
      onDropCapture={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        onDrop(Array.from(event.dataTransfer.files));
      }}
    >
      {children}

      {isOver && (
        // `pointer-events-none` : un calque qui intercepte le curseur ne reçoit
        // jamais le `drop`, et le dépôt échouerait sur sa propre annonce.
        <div className="pointer-events-none absolute inset-1 z-10 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary bg-background/85 text-center">
          <Upload className="size-5 text-primary" aria-hidden />
          <p className="text-sm font-medium">Déposez pour joindre à la réponse</p>
          <p className="text-xs text-muted-foreground">
            Images ou PDF · {MAX_ATTACHMENTS} fichiers, 5 Mo chacun
          </p>
        </div>
      )}
    </div>
  );
}

/** Le sélecteur, à côté du bouton d'envoi. */
export function AttachFilesButton({
  disabled,
  isFull,
  onPick,
}: {
  disabled: boolean;
  /** Plafond atteint : le bouton reste visible et dit pourquoi il ne fait rien. */
  isFull: boolean;
  onPick: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={REPLY_ALLOWED_ATTACHMENT_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          onPick(Array.from(event.target.files ?? []));
          // Le champ conserve sa sélection : sans ce vidage, rechoisir le même
          // fichier après l'avoir retiré ne déclenche plus `change`.
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || isFull}
        title={isFull ? `${MAX_ATTACHMENTS} fichiers au maximum` : undefined}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip />
        Joindre
      </Button>
    </>
  );
}

// Les fichiers retenus, entre le champ et la ligne d'actions. Même forme de
// pastille que dans le fil (voir `AttachmentsList`), où ils réapparaîtront.
export function AttachedFiles({
  files,
  error,
  disabled,
  onRemove,
}: {
  files: File[];
  error: string | null;
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  if (files.length === 0 && !error) return null;

  return (
    <div className="space-y-1.5">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}`}
              className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground"
            >
              <Paperclip className="size-3.5 shrink-0" aria-hidden />
              <span className="max-w-56 truncate text-foreground">{file.name}</span>
              <span className="text-muted-foreground/60">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={disabled}
                aria-label={`Retirer ${file.name}`}
                className="rounded-full p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
