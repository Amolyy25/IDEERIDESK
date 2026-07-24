"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { TicketListItem } from "@/lib/actions/tickets";
import { StatusDot } from "@/components/tickets/status-dot";
import { SourceBadge } from "@/components/tickets/source-badge";
import { SortableHeader } from "@/components/tickets/sortable-header";
import { RelativeTime } from "@/components/tickets/relative-time";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

export const ticketColumns: ColumnDef<TicketListItem>[] = [
  {
    accessorKey: "number",
    header: () => <SortableHeader sortKey="number" label="#" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">#{row.original.number}</span>
    ),
  },
  {
    accessorKey: "subject",
    header: () => <SortableHeader sortKey="subject" label="Sujet" />,
    cell: ({ row }) => (
      <Link
        href={`/tickets/${row.original.id}`}
        className="flex items-center gap-2 font-medium text-foreground hover:text-primary"
      >
        {row.original.hasUnreadActivity && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            title="Activité non vue"
          />
        )}
        {row.original.subject}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => (
      <StatusDot color={row.original.status.color} label={row.original.status.name} />
    ),
  },
  {
    accessorKey: "priority",
    header: "Priorité",
    cell: ({ row }) => (
      <StatusDot color={row.original.priority.color} label={row.original.priority.name} />
    ),
  },
  {
    accessorKey: "category",
    header: "Produit concerné",
    cell: ({ row }) =>
      row.original.category ? (
        <span className="text-sm text-muted-foreground">{row.original.category.name}</span>
      ) : (
        <span className="text-sm text-muted-foreground/50">—</span>
      ),
  },
  {
    accessorKey: "assignee",
    header: "Assigné à",
    cell: ({ row }) => {
      const assignee = row.original.assignee;
      if (!assignee) {
        return <span className="text-sm text-muted-foreground/50">Non assigné</span>;
      }
      return (
        <span className="flex items-center gap-2 text-sm">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">{initials(assignee.name)}</AvatarFallback>
          </Avatar>
          {assignee.name}
        </span>
      );
    },
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => <SourceBadge source={row.original.source} />,
  },
  {
    accessorKey: "updatedAt",
    header: () => <SortableHeader sortKey="updatedAt" label="Mis à jour" />,
    cell: ({ row }) => <RelativeTime date={row.original.updatedAt} />,
  },
];
