"use client";

import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Les deux calques posés sur la zone de saisie pendant qu'elle est prise. Décoratifs
// tous les deux : le bouton d'envoi porte déjà l'état pour les lecteurs d'écran.

// La copie du message, posée sur le champ qu'elle vient de quitter. Le fond opaque
// est laissé au point d'appel (il dépend du champ recouvert) mais n'est pas
// facultatif : sans lui, l'invite du champ vidé transparaît à travers le texte.
export function MessageGhost({
  className,
  children,
}: {
  className?: string;
  /** `null` quand rien n'est en vol : le calque n'existe alors pas du tout. */
  children: string | null;
}) {
  if (children === null) return null;

  return (
    <p
      aria-hidden
      className={cn(
        "reply-lift pointer-events-none absolute inset-0 overflow-hidden text-sm leading-relaxed whitespace-pre-wrap",
        className
      )}
    >
      {children}
    </p>
  );
}

// Posé sur la zone de saisie, à l'endroit exact où le texte va changer : sans lui, le
// champ devient juste insensible au clavier. Voile léger, le message reste lisible.
export function AiWorkingOverlay({ busy, isRewrite }: { busy: boolean; isRewrite: boolean }) {
  if (!busy) return null;

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 grid place-items-center bg-background/55 backdrop-blur-[1px]"
    >
      <p className="inline-flex animate-pulse items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
        <Wand2 className="size-3.5 text-primary" />
        {isRewrite ? "L'IA reprend votre message…" : "L'IA rédige un brouillon…"}
      </p>
    </div>
  );
}
