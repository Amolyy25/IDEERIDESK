"use client";

import { cn } from "@/lib/utils";

/**
 * Bouton d'une barre d'outils d'éditeur : même taille, même état actif, même
 * comportement au survol dans l'éditeur d'articles et dans la zone de réponse
 * d'un ticket.
 *
 * Sorti de `rich-text-editor.tsx` pour que la zone de réponse puisse le
 * reprendre sans tirer avec lui l'éditeur complet — ses extensions vidéo, image
 * redimensionnable et son mode source HTML, qui n'ont rien à faire dans le
 * bundle d'une fiche ticket.
 */
export function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}
