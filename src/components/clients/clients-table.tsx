"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteClient } from "@/lib/actions/clients";
import type { Client } from "@/generated/prisma/client";

type ClientWithTicketCount = Client & { _count: { tickets: number } };

export function ClientsTable({
  clients,
  canDelete,
}: {
  clients: ClientWithTicketCount[];
  /** Sans la permission, la colonne d'actions disparaît plutôt que d'offrir un bouton qui refuse. */
  canDelete: boolean;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteClient(id);
      toast.success("Client supprimé");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Société</TableHead>
            <TableHead>Téléphone</TableHead>
            <TableHead className="text-right">Tickets</TableHead>
            {canDelete && <TableHead className="w-12 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canDelete ? 6 : 5} className="h-32 text-center text-muted-foreground">
                Aucun client pour le moment.
              </TableCell>
            </TableRow>
          ) : (
            clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell className="text-muted-foreground">{client.email}</TableCell>
                <TableCell className="text-muted-foreground">{client.company ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{client.phone ?? "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {client._count.tickets}
                </TableCell>
                {canDelete && (
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irréversible. Impossible si des tickets lui sont
                            associés.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(client.id)}>
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
