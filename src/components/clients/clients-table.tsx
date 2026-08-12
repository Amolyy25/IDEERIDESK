"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Merge, Trash2, Unlink } from "lucide-react";
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
import { deleteClient, separateMergedClient } from "@/lib/actions/clients";
import { plural } from "@/lib/utils";
import { CompanyClientsDialog } from "@/components/clients/company-clients-dialog";
import { MergeClientsDialog } from "@/components/clients/merge-clients-dialog";
import type { Client } from "@/generated/prisma/client";

export type ClientWithTicketCount = Client & {
  _count: {
    tickets: number;
    /** Fiches en doublon que ce contact a absorbées. */
    mergedClients: number;
  };
  /**
   * Contact auquel cette fiche a été rattachée par une fusion, `null` si elle est
   * un contact à part entière.
   *
   * Une fiche absorbée n'est pas supprimée : c'est ce qui rend la fusion
   * défaisable, et c'est elle que la résolution d'un email entrant retrouve avant
   * de remonter au contact actif (voir `resolveTicketClient`). Elle reste donc
   * dans le répertoire, signalée comme telle — la masquer rendrait le
   * détachement introuvable.
   */
  mergedInto: { id: string; name: string; email: string } | null;
};

export function ClientsTable({
  clients,
  canDelete,
  canMerge,
  canViewTickets,
  canExportPersonalData,
}: {
  clients: ClientWithTicketCount[];
  /** Sans la permission, la colonne d'actions disparaît plutôt que d'offrir un bouton qui refuse. */
  canDelete: boolean;
  /**
   * Permission « clients.merge ». Ouvre la fusion depuis une ligne, sans passer
   * par la détection : un agent qui SAIT que deux fiches sont la même personne
   * n'a pas à attendre qu'une règle le devine — c'est le cas quand ni l'adresse
   * ni le nom ne se ressemblent (« Compta » et « Jean Dupont » chez le même
   * client), donc précisément celui qu'aucune détection ne peut trouver.
   */
  canMerge: boolean;
  /** Permissions des actions proposées dans la fenêtre d'une société. */
  canViewTickets: boolean;
  canExportPersonalData: boolean;
}) {
  const router = useRouter();
  /** Société dont on regarde les contacts, `null` quand la fenêtre est fermée. */
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  /** Fiche depuis laquelle une fusion a été ouverte, `null` quand la fenêtre est fermée. */
  const [mergingId, setMergingId] = useState<string | null>(null);
  /** Fiche en cours de détachement : le bouton attend, il ne se clique pas deux fois. */
  const [separatingId, setSeparatingId] = useState<string | null>(null);

  const showActions = canDelete || canMerge;

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

  async function handleSeparate(client: ClientWithTicketCount) {
    setSeparatingId(client.id);
    try {
      const outcome = await separateMergedClient(client.id);
      toast.success(
        [
          `« ${outcome.clientName} » redevient un contact autonome`,
          outcome.restoredTicketCount > 0
            ? `${outcome.restoredTicketCount} ticket${plural(
                outcome.restoredTicketCount,
              )} rendu${plural(outcome.restoredTicketCount)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Détachement impossible");
    } finally {
      setSeparatingId(null);
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
            {showActions && <TableHead className="w-24 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showActions ? 6 : 5} className="h-32 text-center text-muted-foreground">
                Aucun client pour le moment.
              </TableCell>
            </TableRow>
          ) : (
            clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">
                  {client.name}
                  {/* Une fiche rattachée reste dans le répertoire — c'est elle
                      que retrouve un email venu de son adresse, avant de remonter
                      au contact actif. La masquer rendrait le détachement
                      introuvable ; la laisser sans marque ferait croire à un
                      doublon jamais traité. */}
                  {client.mergedInto && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Rattachée à « {client.mergedInto.name} »
                    </span>
                  )}
                  {client._count.mergedClients > 0 && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Réunit {client._count.mergedClients + 1} fiches
                    </span>
                  )}
                </TableCell>
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
                {showActions && (
                  <TableCell className="text-right">
                    {/* Fusionner OU détacher, jamais les deux : une fiche déjà
                        rattachée ne se refusionne pas (le serveur le refuse), et
                        une fiche autonome n'a rien à détacher. */}
                    {canMerge &&
                      (client.mergedInto ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Détacher de ce contact">
                              <Unlink className="size-4" />
                              <span className="sr-only">
                                Détacher {client.name} de « {client.mergedInto.name} »
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Détacher cette fiche ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                « {client.name} » redeviendra un contact autonome, et les tickets qui
                                venaient d&apos;elle lui seront rendus. En revanche, les
                                coordonnées que « {client.mergedInto.name} » a reprises lors de la
                                fusion — nom, téléphone, société — restent en place : elles ne sont
                                pas restaurées.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleSeparate(client)}
                                disabled={separatingId === client.id}
                              >
                                {separatingId === client.id ? "Détachement…" : "Détacher"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Fusionner avec une autre fiche"
                          onClick={() => setMergingId(client.id)}
                        >
                          <Merge className="size-4" />
                          <span className="sr-only">
                            Fusionner {client.name} avec une autre fiche
                          </span>
                        </Button>
                      ))}
                    {canDelete && (
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
                              associés. Pour réunir deux fiches d&apos;une même personne, utilisez
                              la fusion : elle conserve les tickets.
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
                    )}
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

      {/* Montée seulement quand une fusion est ouverte, et remontée à chaque
          fiche : la `key` remet ses valeurs par défaut, qui dépendent des fiches
          en jeu (voir `MergeClientsDialog`). */}
      {mergingId !== null && (
        <MergeClientsDialog
          key={mergingId}
          open
          onOpenChange={(open) => {
            if (!open) setMergingId(null);
          }}
          initialIds={[mergingId]}
          clients={clients}
        />
      )}
    </div>
  );
}
