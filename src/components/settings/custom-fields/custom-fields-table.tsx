"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import { CustomFieldDialog } from "@/components/settings/custom-fields/custom-field-dialog";
import { deleteCustomField } from "@/lib/actions/custom-fields";
import type { CustomField, CustomFieldType } from "@/generated/prisma/client";

const typeLabels: Record<CustomFieldType, string> = {
  TEXT: "Texte",
  TEXTAREA: "Texte long",
  DROPDOWN: "Liste déroulante",
  CHECKBOX: "Case à cocher",
};

export function CustomFieldsTable({ fields }: { fields: CustomField[] }) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteCustomField(id);
      toast.success("Champ supprimé");
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
              <TableHead>Libellé</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Options</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  Aucun champ personnalisé.
                </TableCell>
              </TableRow>
            ) : (
              fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell className="font-medium">{field.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {typeLabels[field.type]}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {field.isRequired && <Badge variant="secondary">Obligatoire</Badge>}
                      {!field.isActive && <Badge variant="outline">Masqué</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CustomFieldDialog
                        field={field}
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
                            <AlertDialogTitle>Supprimer ce champ ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Les valeurs déjà saisies sur les tickets existants resteront en
                              base mais ne seront plus affichées.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(field.id)}>
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
