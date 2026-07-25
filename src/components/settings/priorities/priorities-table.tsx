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
import { PriorityDialog } from "@/components/settings/priorities/priority-dialog";
import { deleteTicketPriority } from "@/lib/actions/priorities";
import type { TicketPriority } from "@/generated/prisma/client";

export function PrioritiesTable({ priorities }: { priorities: TicketPriority[] }) {
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
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette priorité ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irréversible. Les tickets utilisant cette priorité
                            doivent d&apos;abord être réassignés.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(priority.id)}>
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
