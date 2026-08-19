"use client";

import { CircleCheck, CornerDownRight } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { RelativeTime } from "@/components/tickets/relative-time";
import { cn } from "@/lib/utils";
import type { TicketSearchHit } from "@/lib/ticket-search";

/** Une page de l'espace agent, telle que la palette la propose. */
export type PalettePage = { label: string; href: string; keywords?: string[] };

/** Capitales étroites des libellés imprimés sur un ticket : statut, date, légende. */
export const MICRO_LABEL = "text-[10px] font-medium uppercase tracking-[0.12em]";

export function TicketRow({ hit, onSelect }: { hit: TicketSearchHit; onSelect: () => void }) {
  return (
    <CommandItem value={hit.id} onSelect={onSelect} className="gap-0 px-0 py-0">
      <Stub>#{hit.number}</Stub>

      <span className="flex min-w-0 flex-1 items-center gap-2.5 border-l border-dashed border-border py-2 pr-3 pl-3">
        {/* Même repère que dans la file : un ticket clos remonté par une
            recherche ne doit pas se lire comme un dossier à traiter. */}
        {hit.isClosed && (
          <CircleCheck aria-label="Ticket clos" className="size-3.5 text-muted-foreground" />
        )}

        <span className="min-w-0 flex-1 truncate">
          <span className={cn("text-sm", hit.isClosed ? "text-muted-foreground" : "font-medium")}>
            {hit.subject}
          </span>
          {hit.clientName && (
            <span className="ml-2 text-xs text-muted-foreground">{hit.clientName}</span>
          )}
        </span>

        {/* Largeurs fixes : sans elles, statut et date se calent sur leur contenu
            et aucune ligne ne s'aligne avec la suivante. */}
        <span className="hidden w-36 shrink-0 items-center justify-end gap-1.5 sm:flex">
          <span
            aria-hidden
            style={{ backgroundColor: hit.statusColor }}
            className="size-1.5 shrink-0 rounded-full"
          />
          <span className={cn(MICRO_LABEL, "truncate text-muted-foreground")}>
            {hit.statusName}
          </span>
        </span>

        <RelativeTime
          date={hit.updatedAt}
          className={cn(MICRO_LABEL, "hidden w-20 shrink-0 text-right text-muted-foreground sm:block")}
        />
      </span>
    </CommandItem>
  );
}

export function PageRow({ page, onSelect }: { page: PalettePage; onSelect: () => void }) {
  return (
    // `value` préfixée : un identifiant de ticket et un chemin de page cohabitent
    // dans la même liste, cmdk exige que les valeurs restent distinctes.
    <CommandItem value={`page:${page.href}`} onSelect={onSelect} className="gap-0 px-0 py-0">
      <Stub>
        <CornerDownRight className="size-3.5" />
      </Stub>

      <span className="flex min-w-0 flex-1 items-center gap-2.5 border-l border-dashed border-border py-2 pr-3 pl-3">
        <span className="flex-1 truncate text-sm">{page.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{page.href}</span>
      </span>
    </CommandItem>
  );
}

/** La souche du ticket : le numéro, détaché du reste par la perforation verticale. */
function Stub({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-14 shrink-0 items-center justify-end pr-2.5 font-mono text-[11px] tabular-nums text-muted-foreground group-data-selected/command-item:text-foreground">
      {children}
    </span>
  );
}
