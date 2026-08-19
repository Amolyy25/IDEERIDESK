"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttributeDeleteDialog } from "@/components/settings/attribute-delete-dialog";
import { PriorityDialog } from "@/components/settings/priorities/priority-dialog";
import { deleteTicketPriority } from "@/lib/actions/priorities";
import type { TicketPriority } from "@/generated/prisma/client";
import type { DeletionImpact } from "@/lib/ticket-attribute-impact";

export function PrioritiesTable({
  priorities,
  impacts,
}: {
  priorities: TicketPriority[];
  /** Ce que la suppression de chaque valeur entraînerait, par identifiant. */
  impacts: Record<string, DeletionImpact>;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteTicketPriority(id);
      toast.success("Priorité supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Options</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priorities.map((priority) => (
              <TableRow key={priority.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: priority.color }}
                    />
                    {priority.name}
                  </span>
                </TableCell>
                <TableCell>
                  {priority.isDefault && <Badge variant="secondary">Par défaut</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <PriorityDialog
                      priority={priority}
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    <AttributeDeleteDialog
                      label={priority.name}
                      impact={impacts[priority.id]}
                      onConfirm={() => handleDelete(priority.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
