"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Code2, ExternalLink, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import { SourceEmbedDialog } from "@/components/settings/sources/source-embed-dialog";
import { deleteSource, setSourceActive, type SourceListItem } from "@/lib/actions/sources";
import { sourceFormPath } from "@/lib/sources";
import { ticketSourceLabels } from "@/lib/ticket-source";

export function SourcesList({
  sources,
  origin,
}: {
  sources: SourceListItem[];
  /** URL publique de l'application (APP_URL), pour le code d'intégration. */
  origin: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleToggle(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      await setSourceActive(id, isActive);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteSource(id);
      toast.success("Source supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {sources.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Aucune source pour le moment</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez une source pour générer un formulaire et son code d&apos;intégration.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{source.name}</p>
                    {!source.isActive && <Badge variant="outline">Désactivée</Badge>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {sourceFormPath(source.slug)}
                  </p>
                </div>
                <Switch
                  checked={source.isActive}
                  disabled={busyId === source.id}
                  onCheckedChange={(checked) => handleToggle(source.id, checked)}
                  aria-label="Activer cette source"
                />
              </div>

              {source.description && (
                <p className="mt-2.5 line-clamp-2 text-sm text-muted-foreground">
                  {source.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{ticketSourceLabels[source.ticketSource]}</span>
                <Separator orientation="vertical" className="h-3" />
                <span>
                  {source._count.fields} champ{source._count.fields > 1 ? "s" : ""}
                </span>
                <Separator orientation="vertical" className="h-3" />
                <span>
                  {source._count.tickets} ticket{source._count.tickets > 1 ? "s" : ""}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t pt-3">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/settings/sources/${source.id}`}>
                    <SlidersHorizontal className="size-4" />
                    Éditer le formulaire
                  </Link>
                </Button>
                <SourceEmbedDialog
                  slug={source.slug}
                  origin={origin}
                  trigger={
                    <Button size="sm" variant="ghost">
                      <Code2 className="size-4" />
                      Intégration
                    </Button>
                  }
                />
                <Button asChild size="icon" variant="ghost" title="Ouvrir le formulaire">
                  <Link href={sourceFormPath(source.slug)} target="_blank">
                    <ExternalLink className="size-4" />
                  </Link>
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto"
                      disabled={busyId === source.id}
                      title="Supprimer cette source"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer « {source.name} » ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Le formulaire et ses champs seront définitivement supprimés, et les
                        intégrations pointant vers {sourceFormPath(source.slug)} cesseront de
                        fonctionner. Les {source._count.tickets} ticket
                        {source._count.tickets > 1 ? "s" : ""} déjà reçu
                        {source._count.tickets > 1 ? "s" : ""} sont conservés.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(source.id)}>
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
