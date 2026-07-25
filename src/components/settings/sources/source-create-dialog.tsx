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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSource } from "@/lib/actions/sources";
import { slugifySource, sourceFormPath } from "@/lib/sources";

/**
 * Création d'une source : rien que son nom et une description facultative. Tout
 * le reste (branding, champs) se règle ensuite dans le form builder.
 */
export function SourceCreateDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = slugifySource(name);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const created = await createSource({ name, description });
      toast.success("Source créée");
      setOpen(false);
      setName("");
      setDescription("");
      // Enchaîne directement sur le builder : une source vide n'a d'intérêt
      // qu'une fois son formulaire composé.
      router.push(`/settings/sources/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Nouvelle source</DialogTitle>
            <DialogDescription>
              Un point d&apos;entrée de tickets et son formulaire dédié.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="source-name">Nom</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Formulaire web Vente"
              required
              maxLength={80}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {slug ? (
                <>
                  Adresse du formulaire :{" "}
                  <span className="font-mono">{sourceFormPath(slug)}</span>
                </>
              ) : (
                "L'adresse du formulaire est dérivée du nom."
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-description">Description (optionnelle)</Label>
            <Textarea
              id="source-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={300}
              placeholder="À quoi sert cette source, où est-elle intégrée…"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !slug}>
              {isSubmitting ? "Création…" : "Créer la source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
