"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import type {
  Agent,
  CustomField,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";
import type { TicketWithMessages } from "@/lib/actions/tickets";

const NONE = "__none__";

export function AttributesPanel({
  ticket,
  statuses,
  priorities,
  categories,
  agents,
  customFields,
}: {
  ticket: TicketWithMessages;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: Agent[];
  customFields: CustomField[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, unknown>>(
    (ticket.metadata as Record<string, unknown>) ?? {}
  );

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
    <aside className="flex w-80 flex-col gap-5 border-l p-5">
      <div>
        <h2 className="text-sm font-medium">Attributs</h2>
        {isPending && <p className="text-xs text-muted-foreground">Enregistrement…</p>}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Statut</Label>
        <Select
          value={ticket.statusId}
          onValueChange={(v) => apply({ statusId: v })}
        >
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
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Priorité</Label>
        <Select
          value={ticket.priorityId}
          onValueChange={(v) => apply({ priorityId: v })}
        >
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
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Produit concerné</Label>
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
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Assigné à</Label>
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
      </div>

      {ticket.client && (
        <>
          <Separator />
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground">Client</h3>
            <p className="text-sm">{ticket.client.name}</p>
            <p className="text-sm text-muted-foreground">{ticket.client.email}</p>
          </div>
        </>
      )}

      {ticket.sourceUrl && (
        <>
          <Separator />
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground">Page d&apos;origine</h3>
            <a
              href={ticket.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-primary hover:underline"
              title={ticket.sourceUrl}
            >
              {ticket.sourceUrl}
            </a>
          </div>
        </>
      )}

      {customFields.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground">Champs personnalisés</h3>
            {customFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={metadata[field.key]}
                onChange={(value) => handleMetadataChange(field.key, value)}
                compact
              />
            ))}
          </div>
        </>
      )}

      <Separator />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={isDeleting}>
            <Trash2 className="h-3.5 w-3.5" />
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
    </aside>
  );
}
