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
import { StatusDialog } from "@/components/settings/statuses/status-dialog";
import { deleteTicketStatus } from "@/lib/actions/statuses";
import type { TicketStatus } from "@/generated/prisma/client";
import type { DeletionImpact } from "@/lib/ticket-attribute-impact";

export function StatusesTable({
  statuses,
  impacts,
}: {
  statuses: TicketStatus[];
  /** Ce que la suppression de chaque valeur entraînerait, par identifiant. */
  impacts: Record<string, DeletionImpact>;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteTicketStatus(id);
      toast.success("Statut supprimé");
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
            {statuses.map((status) => (
              <TableRow key={status.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </span>
                </TableCell>
                <TableCell>
                  {/* Les cibles des boutons d'action sont des réglages
                      singleton : sans badge, impossible de savoir lequel des
                      statuts les porte sans ouvrir chaque fiche. */}
                  <div className="flex flex-wrap gap-1.5">
                    {status.isDefault && <Badge variant="secondary">Par défaut</Badge>}
                    {status.isClosed && <Badge variant="outline">Fermé</Badge>}
                    {status.isInProgressDefault && <Badge variant="outline">Prise en charge</Badge>}
                    {status.isCloseDefault && <Badge variant="outline">Clôture</Badge>}
                    {status.isReopenDefault && <Badge variant="outline">Réouverture</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <StatusDialog
                      status={status}
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    <AttributeDeleteDialog
                      label={status.name}
                      impact={impacts[status.id]}
                      onConfirm={() => handleDelete(status.id)}
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
