"use client";

import { Ban, Trash2, TriangleAlert } from "lucide-react";
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
import type { DeletionImpact } from "@/lib/ticket-attribute-impact";

// Confirmation de suppression d'un statut, d'une priorité ou d'un produit. Tout
// le texte vient de l'impact calculé côté serveur, que l'action relit avant
// d'écrire (voir `ticket-attribute-impact.ts`).
export function AttributeDeleteDialog({
  label,
  impact,
  onConfirm,
}: {
  label: string;
  /** Absent si la page a été rendue avant que la valeur n'existe : on retombe sur le texte neutre. */
  impact: DeletionImpact | undefined;
  onConfirm: () => void;
}) {
  const blockers = impact?.blockers ?? [];
  const isBlocked = blockers.length > 0;
  const lines = isBlocked ? blockers : (impact?.warnings ?? []);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Supprimer ${label}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBlocked ? `« ${label} » ne peut pas être supprimé` : `Supprimer « ${label} » ?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isBlocked
              ? "Il reste une chose à changer avant :"
              : [impact?.summary, "Cette action est irréversible."].filter(Boolean).join(" ")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {lines.length > 0 && (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {lines.map((line) => (
              <li key={line} className="flex gap-2">
                {isBlocked ? (
                  <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                )}
                {line}
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{isBlocked ? "Fermer" : "Annuler"}</AlertDialogCancel>
          {/* Pas de bouton désactivé : tant que la suppression est impossible,
              elle n'a pas à être proposée. */}
          {!isBlocked && (
            <AlertDialogAction onClick={onConfirm}>Supprimer</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
