"use client";

import { useEffect, useState } from "react";
import { Pencil, Send, Timer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, shortcutTitle, type ModifierKey } from "@/components/ui/kbd";
import type { QueuedReply } from "@/components/tickets/ticket-detail/use-reply-send";

// La fenêtre de rattrapage, à la place des boutons d'envoi. Décompte doublé d'une
// jauge : ces secondes servent à se relire, la barre doit se lire du coin de l'œil.
// « Modifier » et « Annuler » laissent le texte intact dans le champ.
export function QueuedReplyBar({
  reply,
  modifier,
  onEdit,
  onCancel,
  onSendNow,
}: {
  reply: QueuedReply;
  modifier: ModifierKey;
  onEdit: () => void;
  onCancel: () => void;
  onSendNow: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() => reply.dueAt - Date.now());

  // Le battement vit ici et non dans le formulaire : quatre rendus par seconde
  // n'ont aucune raison de traverser l'éditeur riche et le fil des messages. Un
  // quart de seconde, parce qu'un décompte rafraîchi à la seconde pile affiche
  // presque toujours un chiffre déjà faux.
  useEffect(() => {
    const tick = setInterval(() => setRemainingMs(reply.dueAt - Date.now()), 250);
    return () => clearInterval(tick);
  }, [reply.dueAt]);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    // `mt-3` reprend l'écart effectif de la rangée de boutons remplacée : la barre
    // apparaît là où ils étaient, sans décaler le champ au-dessus.
    <div role="status" className="mt-3 overflow-hidden rounded-lg border bg-muted/40">
      {/* Annoncé une seule fois : le décompte visible est masqué aux lecteurs
          d'écran, sans quoi la barre réciterait chaque seconde par-dessus la
          relecture du message. */}
      <p className="sr-only">
        {reply.isPrivate ? "Note" : "Réponse"} en attente d&apos;envoi pendant{" "}
        {Math.round(reply.delayMs / 1000)} secondes. Échap pour annuler,{" "}
        {modifier ?? "Ctrl"} + Entrée pour envoyer tout de suite.
      </p>

      {/* La jauge se vide en un seul mouvement réglé sur la durée de la fenêtre :
          elle n'est pas rendue à nouveau à chaque battement du décompte, et ne
          saute donc pas d'un quart de seconde à l'autre. */}
      <div aria-hidden className="h-1 bg-border/60">
        <div
          className="reply-countdown h-full origin-left bg-primary"
          style={{ animationDuration: `${reply.delayMs}ms` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <p aria-hidden className="inline-flex items-center gap-2 text-sm">
          <Timer className="size-4 shrink-0 text-muted-foreground" />
          <span>
            {/* Chiffres à chasse fixe : sans eux, la ligne entière glisse d'un
                pixel à chaque seconde qui passe. */}
            <span className="font-medium tabular-nums">{seconds}&nbsp;s</span>
            <span className="text-muted-foreground">
              {" "}
              avant {reply.isPrivate ? "l'ajout de la note" : "l'envoi"} — le temps de se
              relire.
            </span>
          </span>
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            title="Annuler l'envoi et reprendre la rédaction"
          >
            <Pencil />
            Modifier
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            title="Renoncer à l'envoi — le message reste dans le champ"
          >
            <Undo2 />
            Annuler
            <Kbd data-icon="inline-end">Échap</Kbd>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSendNow}
            title={`Envoyer sans attendre (${shortcutTitle(modifier, "Entrée")})`}
          >
            <Send />
            Envoyer maintenant
            {modifier && <Kbd data-icon="inline-end">{modifier} ↵</Kbd>}
          </Button>
        </div>
      </div>
    </div>
  );
}
