"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Search, Ticket, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteClient } from "@/lib/actions/clients";
import { subjectExportHref } from "@/lib/privacy-subject";
import type { ClientWithTicketCount } from "@/components/clients/clients-table";

/**
 * Les contacts d'une même société, rassemblés.
 *
 * Le répertoire est trié par contact, alors qu'on y travaille souvent par
 * SOCIÉTÉ : une agence a un gérant, deux négociateurs et une assistante, et la
 * question qui se pose est « qui sont mes interlocuteurs chez eux, et où en sont
 * leurs demandes ? ». La liste principale, triée par date de création, éparpille
 * ces quatre lignes.
 *
 * Une fenêtre plutôt qu'une page : on y vient depuis une ligne du répertoire pour
 * y jeter un œil et repartir. Une navigation ferait perdre la position dans la
 * liste, qu'il faudrait ensuite retrouver.
 *
 * Les contacts sont filtrés depuis la liste DÉJÀ chargée par la page, sans aller
 * les rechercher : le répertoire est servi en entier, une requête de plus
 * n'apporterait rien et ferait attendre. À revoir le jour où cette liste sera
 * paginée — ce serait alors la fenêtre qui montrerait un sous-ensemble sans le
 * dire.
 */
export function CompanyClientsDialog({
  company,
  clients,
  canDelete,
  canViewTickets,
  canExportPersonalData,
  onOpenChange,
}: {
  /** Société ouverte, `null` quand la fenêtre est fermée. */
  company: string | null;
  /** Tout le répertoire : le filtrage par société se fait ici. */
  clients: ClientWithTicketCount[];
  canDelete: boolean;
  /** Permission « tickets.view » : sans elle, le lien vers les demandes disparaît. */
  canViewTickets: boolean;
  /** Permission « privacy.manage » : l'export du dossier d'une personne. */
  canExportPersonalData: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  /** Contact dont la suppression attend confirmation, dans la ligne même. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const members = company ? clients.filter((client) => client.company === company) : [];

  const term = search.trim().toLowerCase();
  const shown = term
    ? members.filter((client) =>
        [client.name, client.email, client.phone ?? ""].some((field) =>
          field.toLowerCase().includes(term),
        ),
      )
    : members;

  const totalTickets = members.reduce((sum, client) => sum + client._count.tickets, 0);

  function close(open: boolean) {
    if (!open) {
      // Remis à zéro à la fermeture, et pas à l'ouverture : une confirmation de
      // suppression restée en suspens ne doit pas se retrouver armée sur la
      // société suivante.
      setSearch("");
      setConfirmingId(null);
    }
    onOpenChange(open);
  }

  async function handleDelete(client: ClientWithTicketCount) {
    setDeletingId(client.id);
    try {
      await deleteClient(client.id);
      toast.success(`${client.name} retiré du répertoire`);
      setConfirmingId(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={company !== null} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company}</DialogTitle>
          <DialogDescription>
            {members.length} contact{members.length > 1 ? "s" : ""} rattaché
            {members.length > 1 ? "s" : ""} à cette société, {totalTickets} ticket
            {totalTickets > 1 ? "s" : ""} au total.
          </DialogDescription>
        </DialogHeader>

        {/* La recherche n'apparaît qu'à partir de quelques contacts : sur trois
            lignes, un champ de filtre est un contrôle qui occupe la place de ce
            qu'il devait aider à trouver. */}
        {members.length > 3 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nom, email ou téléphone…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-8"
              autoFocus
            />
          </div>
        )}

        <ul className="-mx-2 max-h-[60vh] divide-y overflow-y-auto">
          {shown.length === 0 ? (
            <li className="px-2 py-8 text-center text-sm text-muted-foreground">
              {/* Le cas « plus aucun contact » est atteignable sans recherche :
                  supprimer le dernier contact de la société vide la fenêtre
                  restée ouverte. */}
              {members.length === 0
                ? "Plus aucun contact rattaché à cette société."
                : `Aucun contact ne correspond à « ${search} ».`}
            </li>
          ) : (
            shown.map((client) => (
              <li
                key={client.id}
                className="flex flex-wrap items-center justify-between gap-3 px-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{client.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{client.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      client.phone,
                      `${client._count.tickets} ticket${client._count.tickets > 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {confirmingId === client.id ? (
                    // Confirmation dans la ligne plutôt qu'en seconde fenêtre :
                    // empiler une boîte d'alerte par-dessus celle-ci ferait
                    // disparaître le contexte qu'on est venu consulter, et la
                    // question posée porte sur CETTE ligne — elle est mieux
                    // posée à côté d'elle.
                    <>
                      <span className="text-xs text-muted-foreground">Confirmer ?</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8"
                        disabled={deletingId === client.id}
                        onClick={() => handleDelete(client)}
                      >
                        {deletingId === client.id ? "Suppression…" : "Supprimer"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setConfirmingId(null)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <>
                      {canViewTickets && (
                        <Button asChild variant="ghost" size="sm" className="h-8">
                          {/* Recherche par email : la file de tickets cherche
                              aussi dans le contact du ticket, c'est donc bien
                              SES demandes qui s'affichent. */}
                          <Link href={`/tickets?search=${encodeURIComponent(client.email)}`}>
                            <Ticket className="size-4" />
                            Ses tickets
                          </Link>
                        </Button>
                      )}
                      {canExportPersonalData && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Exporter son dossier personnel (RGPD)"
                        >
                          <a href={subjectExportHref("CLIENT", client.id)} download>
                            <Download className="size-4" />
                            <span className="sr-only">Exporter son dossier personnel</span>
                          </a>
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          title="Retirer du répertoire"
                          onClick={() => setConfirmingId(client.id)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Retirer {client.name} du répertoire</span>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
