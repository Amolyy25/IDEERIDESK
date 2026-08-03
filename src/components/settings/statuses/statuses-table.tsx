"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusDialog } from "@/components/settings/statuses/status-dialog";
import { deleteTicketStatus } from "@/lib/actions/statuses";
import type { TicketStatus } from "@/generated/prisma/client";

export function StatusesTable({ statuses }: { statuses: TicketStatus[] }) {
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce statut ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irréversible. Les tickets utilisant ce statut
                            doivent d&apos;abord être réassignés.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(status.id)}>
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
