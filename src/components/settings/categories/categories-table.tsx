"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttributeDeleteDialog } from "@/components/settings/attribute-delete-dialog";
import { CategoryDialog } from "@/components/settings/categories/category-dialog";
import { deleteTicketCategory } from "@/lib/actions/categories";
import type { TicketCategory } from "@/generated/prisma/client";
import type { DeletionImpact } from "@/lib/ticket-attribute-impact";

export function CategoriesTable({
  categories,
  impacts,
}: {
  categories: TicketCategory[];
  /** Ce que la suppression de chaque valeur entraînerait, par identifiant. */
  impacts: Record<string, DeletionImpact>;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteTicketCategory(id);
      toast.success("Produit concerné supprimé");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Mots-clés e-mail</TableHead>
              <TableHead>Options</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {category.description ?? "—"}
                </TableCell>
                {/* Un produit sans mot-clé n'est jamais posé automatiquement : le
                    tiret doit se lire comme « aucun tri à l'arrivée », pas comme
                    une colonne pas encore remplie. */}
                <TableCell>
                  {category.emailKeywords.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {category.emailKeywords.map((keyword) => (
                        <Badge key={keyword} variant="outline" className="font-normal">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {category.isDefault && <Badge variant="secondary">Par défaut</Badge>}
                </TableCell>
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
                    <AttributeDeleteDialog
                      label={category.name}
                      impact={impacts[category.id]}
                      onConfirm={() => handleDelete(category.id)}
                    />
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
