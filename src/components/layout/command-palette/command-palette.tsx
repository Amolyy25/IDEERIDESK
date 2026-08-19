"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { Kbd, useModifierKey } from "@/components/ui/kbd";
import {
  MICRO_LABEL,
  PageRow,
  TicketRow,
  type PalettePage,
} from "@/components/layout/command-palette/palette-rows";
import { useTicketSearch } from "@/components/layout/command-palette/use-ticket-search";
import { matchesNavQuery } from "@/lib/app-navigation";
import { cn, plural } from "@/lib/utils";

// En-têtes de groupe dans la même voix que le reste : capitales étroites, comme
// les mentions imprimées sur un billet. Le primitif les stylise en `text-xs`.
const GROUP_HEADING =
  "**:[[cmdk-group-heading]]:px-3.5 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.12em]";

// Palette de recherche (⌘K / Ctrl+K) : aussi le seul chemin vers un ticket clos,
// que la file ne liste plus.
export function CommandPalette({ pages }: { pages: PalettePage[] }) {
  const [open, setOpen] = useState(false);
  const modifier = useModifierKey();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      // Ctrl+K est le raccourci de la barre d'adresse de Chrome et Firefox.
      event.preventDefault();
      setOpen((previous) => !previous);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Rechercher (${modifier ?? "⌘ / Ctrl"} + K)`}
        className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
      >
        <Search className="size-4 shrink-0 opacity-80" />
        <span className="flex-1 text-left">Rechercher…</span>
        {modifier && <Kbd>{modifier} K</Kbd>}
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche"
        description="Retrouver un ticket ou ouvrir une page de l'espace agent."
        className="sm:max-w-2xl"
      >
        {/* Monté à l'ouverture seulement : le terme et les résultats de la fois
            précédente n'ont aucune raison de survivre. */}
        {open && <PaletteBody pages={pages} onDone={() => setOpen(false)} />}
      </CommandDialog>
    </>
  );
}

function PaletteBody({ pages, onDone }: { pages: PalettePage[]; onDone: () => void }) {
  const router = useRouter();
  const { term, setTerm, hits, isSearching, hasFailed } = useTicketSearch();

  const matchingPages = pages.filter((page) => matchesNavQuery(page, term));
  const isEmpty = hits.length === 0 && matchingPages.length === 0;

  function go(href: string) {
    onDone();
    router.push(href);
  }

  // La page sous le curseur est chargée avant qu'on appuie sur Entrée : c'est ce
  // qui fait que la fiche est déjà là au moment où la palette se ferme.
  function prefetch(value: string) {
    if (!value) return;
    if (value.startsWith("page:")) router.prefetch(value.slice("page:".length));
    else router.prefetch(`/tickets/${value}`);
  }

  return (
    // `shouldFilter` désactivé : c'est le serveur qui décide des tickets qui
    // sortent, un second tri côté navigateur les retirerait de la liste.
    <Command shouldFilter={false} loop label="Recherche" onValueChange={prefetch} className="p-0">
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Rechercher un ticket, un client, un numéro…"
      />

      {/* Hauteur fixe : la palette ne bouge pas d'un pixel pendant qu'on tape. */}
      <CommandList className="h-[19rem] max-h-none">
        {hits.length > 0 && (
          <CommandGroup heading={term ? "Tickets" : "Derniers tickets"} className={GROUP_HEADING}>
            {hits.map((hit) => (
              <TicketRow key={hit.id} hit={hit} onSelect={() => go(`/tickets/${hit.id}`)} />
            ))}
          </CommandGroup>
        )}

        {matchingPages.length > 0 && (
          <CommandGroup heading="Aller à" className={GROUP_HEADING}>
            {matchingPages.map((page) => (
              <PageRow key={page.href} page={page} onSelect={() => go(page.href)} />
            ))}
          </CommandGroup>
        )}

        {isEmpty && <EmptyResults term={term} isSearching={isSearching} hasFailed={hasFailed} />}
      </CommandList>

      <Perforation />

      <div className="flex h-9 shrink-0 items-center justify-between gap-4 px-3.5">
        <span className={cn(MICRO_LABEL, "truncate text-muted-foreground")}>
          {legend({ term, count: hits.length, isSearching, hasFailed })}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Hint keys="↑↓" label="naviguer" />
          <Hint keys="↵" label="ouvrir" />
          <Hint keys="esc" label="fermer" />
        </span>
      </div>
    </Command>
  );
}

// Ligne de déchirement, entre la liste et sa légende. Les encoches sont des
// disques à cheval sur les bords : l'`overflow-hidden` du dialogue en coupe la
// moitié, d'où un trou poinçonné et non une pastille.
function Perforation() {
  return (
    <div aria-hidden className="relative shrink-0 border-t border-dashed border-border">
      <span className="absolute -left-1.5 top-0 size-3 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute -right-1.5 top-0 size-3 -translate-y-1/2 rounded-full bg-background" />
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className={cn(MICRO_LABEL, "flex items-center gap-1.5 text-muted-foreground")}>
      <Kbd className="tracking-normal">{keys}</Kbd>
      {label}
    </span>
  );
}

function EmptyResults({
  term,
  isSearching,
  hasFailed,
}: {
  term: string;
  isSearching: boolean;
  hasFailed: boolean;
}) {
  let title = "Aucun ticket ouvert";
  let hint = "Les nouvelles demandes apparaîtront ici dès qu'un client écrit.";

  if (hasFailed) {
    title = "Recherche indisponible";
    hint = "Réessayez dans un instant.";
  } else if (isSearching) {
    title = "Recherche…";
    hint = "";
  } else if (term) {
    title = `Rien pour « ${term} »`;
    hint = "Essayez un numéro, un nom de client, ou un mot du sujet.";
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function legend({
  term,
  count,
  isSearching,
  hasFailed,
}: {
  term: string;
  count: number;
  isSearching: boolean;
  hasFailed: boolean;
}) {
  if (hasFailed) return "Recherche indisponible";
  if (isSearching) return "Recherche…";
  if (term) return `${count} résultat${plural(count)} · clos inclus`;
  return "Derniers tickets ouverts";
}
