"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { GroupDialog } from "@/components/agents/group-dialog";
import { deleteGroup } from "@/lib/actions/groups";
import type { Agent, TicketCategory } from "@/generated/prisma/client";

type GroupWithRelations = {
  id: string;
  name: string;
  color: string;
  members: { id: string; name: string; email: string }[];
  products: { id: string; name: string; color: string }[];
};

export function GroupsSection({
  groups,
  agents,
  categories,
  isAdmin,
}: {
  groups: GroupWithRelations[];
  agents: Agent[];
  categories: TicketCategory[];
  isAdmin: boolean;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteGroup(id);
      toast.success("Groupe supprimé");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Groupes</h2>
        {isAdmin && (
          <GroupDialog
            agents={agents}
            categories={categories}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nouveau groupe
              </Button>
            }
          />
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun groupe pour le moment.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  {group.name}
                </span>
                {isAdmin && (
                  <div className="flex gap-1">
                    <GroupDialog
                      group={group}
                      agents={agents}
                      categories={categories}
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce groupe ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irréversible. Les agents et produits associés ne
                            sont pas supprimés, seul le groupe disparaît.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(group.id)}>
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs text-muted-foreground">Produits concernés</p>
                <div className="flex flex-wrap gap-1">
                  {group.products.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">Aucun</span>
                  ) : (
                    group.products.map((product) => (
                      <Badge key={product.id} variant="outline">
                        {product.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs text-muted-foreground">Membres</p>
                <div className="flex flex-wrap gap-1">
                  {group.members.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">Aucun</span>
                  ) : (
                    group.members.map((member) => (
                      <Badge key={member.id} variant="secondary">
                        {member.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
