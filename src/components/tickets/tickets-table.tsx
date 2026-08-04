"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SortableHeader } from "@/components/tickets/sortable-header";
import { RelativeTime } from "@/components/tickets/relative-time";
import { ticketSourceLabels } from "@/lib/ticket-source";
import { cn, initials } from "@/lib/utils";
import type { TicketListItem } from "@/lib/actions/tickets";
import type { TicketPriority } from "@/generated/prisma/client";

/**
 * File de tickets.
 *
 * Liste dense et sobre : le sujet et le client portent le poids typographique,
 * tout le reste est en gris. Deux exceptions, et deux seulement — la pastille
 * de statut, qui reprend la couleur définie dans les réglages, et le point
 * jaune d'une activité non vue. Une priorité au-dessus de la normale passe en
 * texte plein plutôt qu'en gris : c'est le seul rang qui mérite d'attirer
 * l'œil.
 */
export function TicketsTable({
  tickets,
  priorities,
  hasActiveFilters,
}: {
  tickets: TicketListItem[];
  /** Priorités configurées : sert à savoir ce qui dépasse la priorité normale. */
  priorities: TicketPriority[];
  /** Change le message affiché quand la liste est vide. */
  hasActiveFilters: boolean;
}) {
  const router = useRouter();

  if (tickets.length === 0) {
    return <EmptyQueue hasActiveFilters={hasActiveFilters} />;
  }

  const defaultPriority = priorities.find((priority) => priority.isDefault);
  let normalOrder = 0;
  if (defaultPriority) {
    normalOrder = defaultPriority.order;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <Th className="w-14 pl-4">
            <SortableHeader sortKey="number" label="#" />
          </Th>
          <Th>
            <SortableHeader sortKey="subject" label="Sujet" />
          </Th>
          <Th className="w-32">Statut</Th>
          <Th className="w-24">Priorité</Th>
          <Th className="w-40">Produit</Th>
          <Th className="w-44">Assigné</Th>
          <Th className="w-32">Source</Th>
          <Th className="w-28 pr-4 text-right">
            <span className="flex justify-end">
              <SortableHeader sortKey="updatedAt" label="Mis à jour" />
            </span>
          </Th>
        </tr>
      </thead>

      <tbody>
        {tickets.map((ticket) => (
          <tr
            key={ticket.id}
            onClick={() => router.push(`/tickets/${ticket.id}`)}
            className="group h-12 cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
          >
            <Td className="relative pl-4">
              {/* Repère de survol : montre la ligne visée sans laisser de
                  bandeau coloré en permanence sur toute la file. */}
              <span
                aria-hidden
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
              />
              <span className="flex items-center gap-1.5">
                {ticket.hasUnreadActivity && (
                  <span
                    aria-label="Activité non vue"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                )}
                <span className="tabular-nums text-muted-foreground">#{ticket.number}</span>
              </span>
            </Td>

            {/* `max-w-0 w-full` : cette colonne absorbe la largeur restante, ce
                qui rend la troncature possible dans un tableau à largeur
                automatique. */}
            <Td className="w-full max-w-0 pr-6">
              <span className="flex items-baseline gap-2">
                {/* Un ticket fusionné apparaît encore dans une liste sans filtre :
                    sans repère, il se lit comme un dossier à traiter alors que le
                    travail se fait ailleurs. */}
                {ticket.mergedIntoId && (
                  <Merge
                    aria-label="Fusionné dans un autre ticket"
                    className="size-3.5 shrink-0 self-center text-muted-foreground"
                  />
                )}
                <Link
                  href={`/tickets/${ticket.id}`}
                  className={cn(
                    "truncate group-hover:underline",
                    ticket.mergedIntoId ? "text-muted-foreground" : "text-foreground",
                    ticket.hasUnreadActivity ? "font-semibold" : "font-medium",
                  )}
                >
                  {ticket.subject}
                </Link>
                {ticket.client && (
                  <span className="truncate text-xs text-muted-foreground">
                    {ticket.client.name}
                  </span>
                )}
              </span>
            </Td>

            <Td>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden
                  style={{ backgroundColor: ticket.status.color }}
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                />
                {ticket.status.name}
              </span>
            </Td>

            <Td>
              <PriorityLabel
                name={ticket.priority.name}
                isElevated={ticket.priority.order > normalOrder}
              />
            </Td>

            <Td className="truncate text-muted-foreground">{categoryLabel(ticket)}</Td>

            <Td>
              <Assignee name={ticket.assignee?.name ?? null} />
            </Td>

            <Td className="truncate text-muted-foreground">{ticketSourceLabels[ticket.source]}</Td>

            <Td className="pr-4 text-right whitespace-nowrap">
              <RelativeTime date={ticket.updatedAt} />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function categoryLabel(ticket: TicketListItem) {
  if (ticket.category) return ticket.category.name;
  return "—";
}

function PriorityLabel({ name, isElevated }: { name: string; isElevated: boolean }) {
  if (isElevated) {
    return <span className="font-medium whitespace-nowrap text-foreground">{name}</span>;
  }
  return <span className="whitespace-nowrap text-muted-foreground">{name}</span>;
}

function Assignee({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-muted-foreground/60">Non assigné</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        // Séparation en ombre interne et non en bordure : sur un en-tête
        // collant d'un tableau à bordures fusionnées, la bordure défile avec le
        // tableau et disparaît.
        "sticky top-0 z-10 h-10 bg-card px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * Cellule : hauteur portée par la ligne (`h-12`), pas par la marge interne —
 * toutes les lignes gardent ainsi le même pas, qu'elles portent un avatar ou
 * du texte seul.
 */
function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("px-3 align-middle", className)}>{children}</td>;
}

function EmptyQueue({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  if (hasActiveFilters) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm font-medium">Aucun ticket ne correspond</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Élargissez la recherche ou retirez un filtre.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-medium">File dégagée</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Les nouvelles demandes arrivent ici dès qu&apos;un client écrit ou remplit un formulaire.
      </p>
    </div>
  );
}
