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
import { ScrollArea } from "@/components/ui/scroll-area";
import { createGroup, updateGroup } from "@/lib/actions/groups";
import type { Agent, TicketCategory } from "@/generated/prisma/client";

type GroupWithRelations = {
  id: string;
  name: string;
  color: string;
  members: { id: string }[];
  products: { id: string }[];
};

export function GroupDialog({
  group,
  agents,
  categories,
  trigger,
}: {
  group?: GroupWithRelations;
  agents: Agent[];
  categories: TicketCategory[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(group);

  const initialMemberIds = new Set(group?.members.map((m) => m.id) ?? []);
  const initialProductIds = new Set(group?.products.map((p) => p.id) ?? []);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const input = {
        name: formData.get("name") as string,
        color: formData.get("color") as string,
        memberIds: formData.getAll("memberIds") as string[],
        productIds: formData.getAll("productIds") as string[],
      };

      if (group) {
        await updateGroup(group.id, input);
      } else {
        await createGroup(input);
      }
      toast.success(isEditing ? "Groupe mis à jour" : "Groupe créé");
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
            <DialogTitle>{isEditing ? "Modifier le groupe" : "Nouveau groupe"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required maxLength={60} defaultValue={group?.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Couleur</Label>
            <Input
              id="color"
              name="color"
              type="color"
              className="h-9 w-16 p-1"
              defaultValue={group?.color ?? "#71717a"}
            />
          </div>

          <div className="space-y-2">
            <Label>Produits concernés couverts</Label>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="space-y-1.5">
                {categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun produit concerné configuré.</p>
                )}
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`product-${category.id}`}
                      name="productIds"
                      value={category.id}
                      defaultChecked={initialProductIds.has(category.id)}
                    />
                    <Label
                      htmlFor={`product-${category.id}`}
                      className="text-sm font-normal text-muted-foreground"
                    >
                      {category.name}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label>Membres</Label>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="space-y-1.5">
                {agents.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun agent disponible.</p>
                )}
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`member-${agent.id}`}
                      name="memberIds"
                      value={agent.id}
                      defaultChecked={initialMemberIds.has(agent.id)}
                    />
                    <Label
                      htmlFor={`member-${agent.id}`}
                      className="text-sm font-normal text-muted-foreground"
                    >
                      {agent.name}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
