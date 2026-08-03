"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
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
import { CategoryDialog } from "@/components/knowledge-base/category-dialog";
import { deleteKnowledgeCategory } from "@/lib/actions/knowledge-base";
import type { KnowledgeCategory } from "@/generated/prisma/client";

export function CategoriesTable({ categories }: { categories: KnowledgeCategory[] }) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteKnowledgeCategory(id);
      toast.success("Catégorie supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucune catégorie</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Regroupez vos articles par thème pour les retrouver plus vite.
          </p>
        </div>
        <CategoryDialog
          trigger={
            <Button size="sm" className="mt-1">
              <Plus className="h-4 w-4" />
              Nouvelle catégorie
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CategoryDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle catégorie
            </Button>
          }
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CategoryDialog
                        category={category}
                        trigger={
                          <Button size="icon" variant="ghost">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Impossible si elle contient encore des articles.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(category.id)}>
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
