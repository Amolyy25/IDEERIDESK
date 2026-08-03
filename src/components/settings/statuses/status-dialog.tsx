"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { createTicketStatus, updateTicketStatus } from "@/lib/actions/statuses";
import type { TicketStatus } from "@/generated/prisma/client";

export function StatusDialog({
  status,
  trigger,
}: {
  status?: TicketStatus;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(status);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const input = {
        name: formData.get("name") as string,
        color: formData.get("color") as string,
        isClosed: formData.get("isClosed") === "on",
        isDefault: formData.get("isDefault") === "on",
        isInProgressDefault: formData.get("isInProgressDefault") === "on",
        isCloseDefault: formData.get("isCloseDefault") === "on",
        isReopenDefault: formData.get("isReopenDefault") === "on",
      };
      if (status) {
        await updateTicketStatus(status.id, input);
      } else {
        await createTicketStatus(input);
      }
      toast.success(isEditing ? "Statut mis à jour" : "Statut créé");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Modifier le statut" : "Nouveau statut"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required maxLength={60} defaultValue={status?.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Couleur</Label>
            <Input
              id="color"
              name="color"
              type="color"
              className="h-9 w-16 p-1"
              defaultValue={status?.color ?? "#71717a"}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isClosed" name="isClosed" defaultChecked={status?.isClosed} />
            <Label htmlFor="isClosed" className="text-sm font-normal text-muted-foreground">
              Considéré comme un statut fermé
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isDefault" name="isDefault" defaultChecked={status?.isDefault} />
            <Label htmlFor="isDefault" className="text-sm font-normal text-muted-foreground">
              Statut par défaut des nouveaux tickets
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isInProgressDefault"
              name="isInProgressDefault"
              defaultChecked={status?.isInProgressDefault}
            />
            <Label
              htmlFor="isInProgressDefault"
              className="text-sm font-normal text-muted-foreground"
            >
              Statut appliqué par le bouton « Prendre en charge »
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isCloseDefault"
              name="isCloseDefault"
              defaultChecked={status?.isCloseDefault}
            />
            <Label
              htmlFor="isCloseDefault"
              className="text-sm font-normal text-muted-foreground"
            >
              Statut appliqué par le bouton « Clore ce ticket »
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isReopenDefault"
              name="isReopenDefault"
              defaultChecked={status?.isReopenDefault}
            />
            <Label
              htmlFor="isReopenDefault"
              className="text-sm font-normal text-muted-foreground"
            >
              Statut appliqué quand un client répond à un ticket clos
            </Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
