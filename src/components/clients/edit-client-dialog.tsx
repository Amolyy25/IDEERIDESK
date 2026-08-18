"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClient } from "@/lib/actions/clients";
import { CLIENT_FIELD_LIMITS } from "@/lib/client-fields";
import type { Client } from "@/generated/prisma/client";

export function EditClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      await updateClient(client.id, {
        name: formData.get("name") as string,
        email: formData.get("email") as string,
        phone: (formData.get("phone") as string) || null,
        company: (formData.get("company") as string) || null,
      });
      toast.success("Fiche mise à jour");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier le client");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Modifier la fiche</DialogTitle>
            <DialogDescription>
              L&apos;adresse email rattache les emails entrants à ce contact : la changer
              redirige ses prochaines demandes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Nom</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={client.name}
              required
              maxLength={CLIENT_FIELD_LIMITS.name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              name="email"
              type="email"
              defaultValue={client.email}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Téléphone</Label>
            <Input
              id="edit-phone"
              name="phone"
              defaultValue={client.phone ?? ""}
              maxLength={CLIENT_FIELD_LIMITS.phone}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-company">Société</Label>
            <Input
              id="edit-company"
              name="company"
              defaultValue={client.company ?? ""}
              maxLength={CLIENT_FIELD_LIMITS.company}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
