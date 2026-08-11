"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Trash2 } from "lucide-react";
import type { DossierClient } from "@/lib/ticket-dossier";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { updateTicketAttributes, deleteTicket } from "@/lib/actions/tickets";
import { CustomFieldInput } from "@/components/tickets/ticket-detail/custom-field-input";
import { SlaSummary } from "@/components/tickets/ticket-detail/sla-summary";
import type {
  Agent,
  CustomField,
  SourceField,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";
import type { TicketWithMessages } from "@/lib/actions/tickets";

const NONE = "__none__";

/** Bloc de la colonne, avec son intitulé en petites capitales. */
function PanelBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b px-5 py-4 last:border-b-0">
      <p className="pb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** « Client » au singulier tant qu'il n'y en a qu'un : le pluriel signale la fusion. */
function clientsBlockTitle(count: number) {
  if (count > 1) return `Clients (${count})`;
  return "Client";
}

export function AttributesPanel({
  ticket,
  clients,
  statuses,
  priorities,
  categories,
  agents,
  customFields,
  sourceFields,
  canDelete,
}: {
  ticket: TicketWithMessages;
  /**
   * Toutes les personnes du dossier, doublons fusionnés compris — et non le
   * seul `ticket.client`. Le panneau doit montrer qui recevra la réponse, or
   * après une fusion ce n'est plus une seule personne.
   */
  clients: DossierClient[];
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: Agent[];
  customFields: CustomField[];
  /** Champs du formulaire de la source d'origine, en lecture seule. */
  sourceFields: SourceField[];
  /** Permission « tickets.delete » : sans elle, le pied du panneau disparaît. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, unknown>>(
    (ticket.metadata as Record<string, unknown>) ?? {},
  );

  // Réponses aux champs propres à la source : en lecture seule, contrairement
  // aux champs personnalisés globaux qu'un agent peut corriger.
  const formAnswers = sourceFields
    .filter((field) => field.type !== "HEADER" && field.type !== "FILE")
    .map((field) => {
      const raw = metadata[field.key];
      const value =
        typeof raw === "boolean" ? (raw ? "Oui" : "Non") : typeof raw === "string" ? raw : "";
      return { key: field.key, label: field.label, value };
    })
    .filter((answer) => answer.value !== "");

  function apply(input: Parameters<typeof updateTicketAttributes>[1]) {
    startTransition(async () => {
      try {
        await updateTicketAttributes(ticket.id, input);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
      }
    });
  }

  function handleMetadataChange(key: string, value: unknown) {
    const next = { ...metadata, [key]: value };
    setMetadata(next);
    apply({ metadata: next });
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteTicket(ticket.id);
      toast.success("Ticket supprimé");
      router.push("/tickets");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
      setIsDeleting(false);
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l">
      {/* Même hauteur minimale que l'en-tête du fil : les deux barres portent une
          bordure basse, un écart de quelques pixels se voit immédiatement. */}
      <div className="flex min-h-[4.5rem] shrink-0 items-center justify-between gap-2 border-b px-5">
        <h2 className="text-sm font-medium">Attributs</h2>
        {isPending && <span className="text-xs text-muted-foreground">Enregistrement…</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PanelBlock title="Suivi">
          <Field label="Statut">
            <Select value={ticket.statusId} onValueChange={(v) => apply({ statusId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Priorité">
            <Select value={ticket.priorityId} onValueChange={(v) => apply({ priorityId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((priority) => (
                  <SelectItem key={priority.id} value={priority.id}>
                    {priority.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </PanelBlock>

        {/* Masqué quand le ticket ne porte aucune échéance : la priorité qui lui
            a été attribuée n'a pas de délai configuré, ou il est antérieur à la
            mise en service du SLA. Un bloc « aucun engagement / aucun
            engagement » sur chaque fiche n'apprendrait rien à personne. */}
        {(ticket.firstResponseDueAt || ticket.resolutionDueAt) && (
          <PanelBlock title="Délais">
            <SlaSummary ticket={ticket} />
          </PanelBlock>
        )}

        <PanelBlock title="Affectation">
          <Field label="Produit concerné">
            <Select
              value={ticket.categoryId ?? NONE}
              onValueChange={(v) => apply({ categoryId: v === NONE ? null : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Assigné à">
            <Select
              value={ticket.assigneeId ?? NONE}
              onValueChange={(v) => apply({ assigneeId: v === NONE ? null : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Non assigné</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </PanelBlock>

        {clients.length > 0 && (
          <PanelBlock title={clientsBlockTitle(clients.length)}>
            {clients.map((client) => (
              <div key={client.ticketId} className="space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-medium">{client.name}</p>
                  {/* D'où vient cette personne. Sans ce repère, deux noms
                      empilés sous « Clients » ne disent pas lequel a ouvert le
                      dossier et lequel est arrivé par un doublon. */}
                  {!client.isPrimary && (
                    <Link
                      href={`/tickets/${client.ticketId}`}
                      className="font-mono text-[11px] text-muted-foreground tabular-nums hover:underline"
                      title={`Arrivé par le ticket #${client.ticketNumber}, fusionné dans celui-ci`}
                    >
                      #{client.ticketNumber}
                    </Link>
                  )}
                </div>
                <a
                  href={`mailto:${client.email}`}
                  className="block truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
                  title={client.email}
                >
                  {client.email}
                </a>
              </div>
            ))}

            {clients.length > 1 && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Une réponse publique part à chacun, dans sa propre conversation.
              </p>
            )}
          </PanelBlock>
        )}

        {ticket.sourceUrl && (
          <PanelBlock title="Page d'origine">
            <a
              href={ticket.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-sm text-primary hover:underline"
              title={ticket.sourceUrl}
            >
              <ExternalLink className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-all">{ticket.sourceUrl}</span>
            </a>
          </PanelBlock>
        )}

        {formAnswers.length > 0 && (
          <PanelBlock title="Réponses du formulaire">
            {formAnswers.map((answer) => (
              <div key={answer.key} className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{answer.label}</p>
                <p className="whitespace-pre-wrap text-sm">{answer.value}</p>
              </div>
            ))}
          </PanelBlock>
        )}

        {customFields.length > 0 && (
          <PanelBlock title="Champs personnalisés">
            {customFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={metadata[field.key]}
                onChange={(value) => handleMetadataChange(field.key, value)}
                compact
              />
            ))}
          </PanelBlock>
        )}
      </div>

      {canDelete && (
        <div className="shrink-0 border-t px-5 py-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Supprimer le ticket
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce ticket ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Le fil de messages et les pièces jointes
                  associées seront définitivement supprimés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </aside>
  );
}
