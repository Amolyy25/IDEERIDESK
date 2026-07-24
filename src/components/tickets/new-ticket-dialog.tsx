"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTicket } from "@/lib/actions/tickets";
import type { TicketStatus, TicketPriority, TicketCategory, Client } from "@/generated/prisma/client";

const NONE = "__none__";

export function NewTicketDialog({
  statuses,
  priorities,
  categories,
  clients,
}: {
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  clients: Client[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultStatus = statuses.find((s) => s.isDefault) ?? statuses[0];
  const defaultPriority = priorities.find((p) => p.isDefault) ?? priorities[0];

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const categoryId = formData.get("categoryId") as string;
      const clientId = formData.get("clientId") as string;
      const ticket = await createTicket({
        subject: formData.get("subject") as string,
        description: formData.get("description") as string,
        statusId: formData.get("statusId") as string,
        priorityId: formData.get("priorityId") as string,
        categoryId: categoryId === NONE ? null : categoryId,
        clientId: clientId === NONE ? null : clientId,
      });
      toast.success("Ticket créé");
      setOpen(false);
      router.push(`/tickets/${ticket.id}`);
    } catch {
      toast.error("Impossible de créer le ticket");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nouveau ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nouveau ticket</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="subject">Sujet</Label>
            <Input id="subject" name="subject" required maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" required rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select name="statusId" defaultValue={defaultStatus?.id}>
                <SelectTrigger>
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
              <Label>Priorité</Label>
              <Select name="priorityId" defaultValue={defaultPriority?.id}>
                <SelectTrigger>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Produit concerné</Label>
              <Select name="categoryId" defaultValue={NONE}>
                <SelectTrigger>
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
              <Label>Client</Label>
              <Select name="clientId" defaultValue={NONE}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Création…" : "Créer le ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
