"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Wand2 } from "lucide-react";
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
import { CannedResponseDialog } from "@/components/settings/canned-responses/canned-response-dialog";
import {
  deleteCannedResponse,
  type CannedResponseWithFilters,
} from "@/lib/actions/canned-responses";
import type { FilterDimensionWithOptions } from "@/lib/canned-responses";

export function CannedResponsesTable({
  responses,
  dimensions,
}: {
  responses: CannedResponseWithFilters[];
  dimensions: FilterDimensionWithOptions[];
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteCannedResponse(id);
      toast.success("Réponse supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  if (responses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium">Aucune réponse prédéfinie</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Créez-en une pour la retrouver d&apos;un clic dans la zone de rédaction des tickets, sans
          la réécrire à chaque fois.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titre</TableHead>
            <TableHead>Proposée sur</TableHead>
            <TableHead className="w-24">État</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((response) => (
            <TableRow key={response.id}>
              <TableCell className="max-w-xs align-top">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{response.title}</p>
                  {/* Une réponse qui s'écrit toute seule dans le champ ne doit
                      pas se découvrir en ouvrant un ticket : elle est signalée
                      ici, dans la liste. */}
                  {response.autoInsert && (
                    <Badge variant="secondary" className="gap-1">
                      <Wand2 className="size-3" />
                      Pré-remplie
                    </Badge>
                  )}
                </div>
                {/* Les premiers mots du contenu : de quoi reconnaître la bonne
                    réponse sans ouvrir la fiche. */}
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{response.body}</p>
              </TableCell>
              <TableCell className="align-top">
                <FiltersCell response={response} dimensions={dimensions} />
              </TableCell>
              <TableCell className="align-top">
                {response.isActive && <Badge variant="secondary">Active</Badge>}
                {!response.isActive && <Badge variant="outline">En pause</Badge>}
              </TableCell>
              <TableCell className="text-right align-top">
                <div className="flex justify-end gap-1">
                  <CannedResponseDialog
                    response={response}
                    dimensions={dimensions}
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
                        <AlertDialogTitle>Supprimer cette réponse ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action est irréversible. Les messages déjà envoyés à partir de
                          cette réponse ne changent pas : ce sont des copies.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(response.id)}>
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
  );
}

/**
 * Les restrictions de la réponse, lisibles sans ouvrir la fiche : c'est la
 * question qu'on se pose devant la liste (« pourquoi celle-là ne sort pas sur
 * mon ticket ? »). Les dimensions sans filtre ne sont pas mentionnées — elles ne
 * restreignent rien, les énumérer noierait celles qui comptent.
 */
function FiltersCell({
  response,
  dimensions,
}: {
  response: CannedResponseWithFilters;
  dimensions: FilterDimensionWithOptions[];
}) {
  if (response.filters.length === 0) {
    return <span className="text-sm text-muted-foreground">Tous les tickets</span>;
  }

  return (
    <div className="space-y-1.5">
      {dimensions.map((dimension) => {
        const valueIds = response.filters
          .filter((filter) => filter.dimension === dimension.key)
          .map((filter) => filter.valueId);

        if (valueIds.length === 0) {
          return null;
        }

        return (
          <div key={dimension.key} className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{dimension.label} :</span>
            {valueIds.map((valueId) => (
              <ValueBadge key={valueId} valueId={valueId} dimension={dimension} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Nom de la valeur filtrée. Un identifiant absent des valeurs actuelles est
 * signalé plutôt que masqué : le produit a été supprimé depuis, et ce filtre
 * empêche désormais la réponse de sortir — il faut pouvoir le voir et l'enlever.
 */
function ValueBadge({
  valueId,
  dimension,
}: {
  valueId: string;
  dimension: FilterDimensionWithOptions;
}) {
  const option = dimension.options.find((candidate) => candidate.id === valueId);

  if (!option) {
    return (
      <Badge variant="destructive" title={valueId}>
        Valeur supprimée
      </Badge>
    );
  }
  return <Badge variant="outline">{option.name}</Badge>;
}
