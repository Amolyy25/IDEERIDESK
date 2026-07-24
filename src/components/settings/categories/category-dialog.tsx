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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createTicketCategory, updateTicketCategory } from "@/lib/actions/categories";
import type { TicketCategory } from "@/generated/prisma/client";

export function CategoryDialog({
  category,
  trigger,
}: {
  category?: TicketCategory;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(category);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const input = {
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || null,
        color: formData.get("color") as string,
        isDefault: formData.get("isDefault") === "on",
      };
      if (category) {
        await updateTicketCategory(category.id, input);
      } else {
        await createTicketCategory(input);
      }
      toast.success(isEditing ? "Produit concerné mis à jour" : "Produit concerné créé");
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
            <DialogTitle>
              {isEditing ? "Modifier le produit concerné" : "Nouveau produit concerné"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required maxLength={60} defaultValue={category?.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={category?.description ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Couleur</Label>
            <Input
              id="color"
              name="color"
              type="color"
              className="h-9 w-16 p-1"
              defaultValue={category?.color ?? "#71717a"}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isDefault" name="isDefault" defaultChecked={category?.isDefault} />
            <Label htmlFor="isDefault" className="text-sm font-normal text-muted-foreground">
              Produit concerné par défaut des nouveaux tickets
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
