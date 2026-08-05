"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { CannedResponseForTicket } from "@/lib/canned-responses";

/**
 * Le choix d'une réponse type, à côté du bouton d'envoi.
 *
 * La liste reçue est déjà filtrée pour ce ticket (voir
 * `listCannedResponsesForTicket`) et ses variables déjà remplies : l'agent voit
 * exactement le texte qui va arriver dans son champ. Rien n'est envoyé au clic,
 * le texte est seulement inséré — une réponse type est un point de départ, pas
 * un message prêt à partir.
 */
export function CannedResponsePicker({
  responses,
  onInsert,
}: {
  responses: CannedResponseForTicket[];
  onInsert: (body: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Aucune réponse ne concerne ce ticket : pas de bouton qui ouvrirait le vide.
  if (responses.length === 0) {
    return null;
  }

  function handleSelect(response: CannedResponseForTicket) {
    onInsert(response.body);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <MessageSquareText />
          Réponses types
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Chercher une réponse…" />
          <CommandList>
            <CommandEmpty>Aucune réponse ne correspond.</CommandEmpty>
            {responses.map((response) => (
              <CommandItem
                key={response.id}
                // La recherche porte sur le titre ET le contenu : on se souvient
                // souvent d'une phrase de la réponse, pas de son titre interne.
                value={`${response.title} ${response.body}`}
                onSelect={() => handleSelect(response)}
                className="flex-col items-start gap-0.5"
              >
                <span className="font-medium">{response.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{response.body}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
