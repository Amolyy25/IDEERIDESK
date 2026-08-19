"use client";

import { useEffect, useState } from "react";
import { fetchTicketSearch } from "@/lib/api/ticket-search";
import { matchesQuery } from "@/lib/search-match";
import type { TicketSearchHit } from "@/lib/ticket-search";

// Assez court pour ne pas se sentir sous les doigts, assez long pour ne pas
// tirer une requête par lettre sur une frappe rapide.
const DEBOUNCE_MS = 110;

// Survit à la fermeture de la palette : réouvrir, ou revenir sur un terme déjà
// tapé, affiche la liste sans attendre le réseau. La requête part quand même et
// remplace le contenu du cache — instantané et à jour.
const cache = new Map<string, TicketSearchHit[]>();

type Served = { term: string; hits: TicketSearchHit[] };

export function useTicketSearch() {
  const [term, setTerm] = useState("");
  const [served, setServed] = useState<Served>(() => ({ term: "", hits: cache.get("") ?? [] }));
  const [failedTerm, setFailedTerm] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(
      async () => {
        try {
          const hits = await fetchTicketSearch(term, controller.signal);
          cache.set(term, hits);
          setServed({ term, hits });
          setFailedTerm(null);
        } catch {
          // Requête annulée par la frappe suivante : ce n'est pas une panne.
          if (controller.signal.aborted) return;
          setFailedTerm(term);
        }
      },
      term === "" ? 0 : DEBOUNCE_MS
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Le cache est lu au rendu : il n'est écrit qu'avec `setServed` juste au-dessus,
  // donc jamais en avance sur ce que React vient d'afficher.
  const hits = cache.get(term) ?? narrowed(served, term);
  const hasFailed = failedTerm === term;

  return {
    term,
    setTerm,
    hits,
    hasFailed,
    isSearching: !hasFailed && !cache.has(term) && served.term !== term,
  };
}

// Resserre la liste déjà obtenue pendant que la requête part : la liste réagit à
// la frappe sans attendre le réseau. Contrepartie assumée — un ticket trouvé par
// le corps de son fil (invisible ici) peut disparaître puis revenir à la réponse.
function narrowed(served: Served, term: string) {
  if (!term.startsWith(served.term)) return served.hits;
  return served.hits.filter((hit) =>
    matchesQuery([`#${hit.number}`, hit.subject, hit.clientName], term)
  );
}
