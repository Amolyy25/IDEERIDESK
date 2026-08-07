"use client";

import { useState } from "react";
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
import { CompanyClientsDialog } from "@/components/clients/company-clients-dialog";
import type { Client } from "@/generated/prisma/client";

export type ClientWithTicketCount = Client & { _count: { tickets: number } };

export function ClientsTable({
  clients,
  canDelete,
  canViewTickets,
  canExportPersonalData,
}: {
  clients: ClientWithTicketCount[];
  /** Sans la permission, la colonne d'actions disparaît plutôt que d'offrir un bouton qui refuse. */
  canDelete: boolean;
  /** Permissions des actions proposées dans la fenêtre d'une société. */
  canViewTickets: boolean;
  canExportPersonalData: boolean;
}) {
  const router = useRouter();
  /** Société dont on regarde les contacts, `null` quand la fenêtre est fermée. */
  const [openCompany, setOpenCompany] = useState<string | null>(null);

  // Combien de contacts par société, calculé une fois pour toute la table : c'est
  // ce nombre qui donne une raison de cliquer. Sans lui, rien ne distingue une
  // société à quatre interlocuteurs d'une société à un seul.
  const contactsPerCompany = new Map<string, number>();
  for (const client of clients) {
    if (!client.company) continue;
    contactsPerCompany.set(client.company, (contactsPerCompany.get(client.company) ?? 0) + 1);
  }

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
                <TableCell className="text-muted-foreground">
                  {client.company ? (
                    <button
                      type="button"
                      onClick={() => setOpenCompany(client.company)}
                      className="rounded underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {client.company}
                      {/* Le nombre n'apparaît qu'à partir de deux : sur une
                          société à un seul contact, il n'apprend rien et
                          alourdit la colonne. */}
                      {(contactsPerCompany.get(client.company) ?? 0) > 1 && (
                        <span className="ml-1.5 text-xs text-muted-foreground/70">
                          {contactsPerCompany.get(client.company)} contacts
                        </span>
                      )}
                    </button>
                  ) : (
                    "—"
                  )}
                </TableCell>
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

      {/* Montée une seule fois, hors de la boucle : une fenêtre par ligne, ce
          serait autant de composants Radix instanciés pour n'en ouvrir jamais
          qu'un. */}
      <CompanyClientsDialog
        company={openCompany}
        clients={clients}
        canDelete={canDelete}
        canViewTickets={canViewTickets}
        canExportPersonalData={canExportPersonalData}
        onOpenChange={(open) => {
          if (!open) setOpenCompany(null);
        }}
      />
    </div>
  );
}
