"use client";

import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, shortcutTitle, type ModifierKey } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { SendPhase } from "@/components/tickets/ticket-detail/use-reply-send";

export function SendButton({
  phase,
  isPrivate,
  requiresApproval,
  disabled,
  modifier,
  onClick,
}: {
  phase: SendPhase;
  isPrivate: boolean;
  requiresApproval: boolean;
  disabled: boolean;
  modifier: ModifierKey;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="sm"
      // Inerte pendant toute la séquence, mais pas éteint : c'est lui qui porte
      // la confirmation, et une coche à moitié effacée annonce mal une réussite.
      className={cn(phase !== "idle" && "disabled:opacity-100")}
      title={shortcutTitle(modifier, "Entrée")}
    >
      <SendIcon phase={phase} />
      <SendLabel phase={phase} isPrivate={isPrivate} requiresApproval={requiresApproval} />
      {modifier && <Kbd data-icon="inline-end">{modifier} ↵</Kbd>}
    </Button>
  );
}

// L'avion et la coche occupent la MÊME case de grille : les échanger ne doit pas
// décaler le libellé d'un pixel.
function SendIcon({ phase }: { phase: SendPhase }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <Send className={cn("size-4 col-start-1 row-start-1", planeClass(phase))} />
      {(phase === "sent" || phase === "returning") && (
        <Check
          className={cn(
            "size-4 col-start-1 row-start-1",
            phase === "sent" ? "reply-check-in" : "reply-check-out"
          )}
        />
      )}
    </span>
  );
}

// Même classe en `sending` et en `sent` : une classe inchangée ne relance pas
// l'animation, l'avion reste donc sorti au lieu de redécoller au retour serveur.
function planeClass(phase: SendPhase) {
  if (phase === "sending" || phase === "sent") return "reply-plane-depart";
  if (phase === "returning" || phase === "aborting") return "reply-plane-return";
  return "";
}

// Les trois libellés sont rendus l'un sur l'autre : le bouton prend la largeur du plus
// long une fois pour toutes, au lieu de se redimensionner à chaque étape.
function SendLabel({
  phase,
  isPrivate,
  requiresApproval,
}: {
  phase: SendPhase;
  isPrivate: boolean;
  requiresApproval: boolean;
}) {
  const rest = isPrivate
    ? "Ajouter la note"
    : requiresApproval
      ? "Envoyer pour validation"
      : "Envoyer";
  const busy = isPrivate ? "Ajout…" : "Envoi…";
  const done = isPrivate ? "Note ajoutée" : requiresApproval ? "Transmise" : "Envoyé";

  let active = rest;
  if (phase === "sending") active = busy;
  else if (phase === "sent") active = done;

  return (
    <span className="grid">
      {[rest, busy, done].map((label, index) => (
        <span
          key={index}
          // Les libellés inactifs tiennent la largeur : masqués aux lecteurs
          // d'écran, le nom accessible du bouton reste celui qu'on voit.
          aria-hidden={label !== active}
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-300",
            label === active ? "opacity-100" : "opacity-0"
          )}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
