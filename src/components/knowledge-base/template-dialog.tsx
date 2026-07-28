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
import { Textarea } from "@/components/ui/textarea";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import { createArticleTemplate, updateArticleTemplate } from "@/lib/actions/knowledge-base";
import type { ArticleTemplate } from "@/generated/prisma/client";

export function TemplateDialog({
  template,
  trigger,
}: {
  template?: ArticleTemplate;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(template);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const input = {
        name: formData.get("name") as string,
        content: formData.get("content") as string,
      };
      if (template) {
        await updateArticleTemplate(template.id, input);
      } else {
        await createArticleTemplate(input);
      }
      toast.success(isEditing ? "Modèle mis à jour" : "Modèle créé");
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
      <DialogContent className="sm:max-w-lg">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" required maxLength={120} defaultValue={template?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">Trame</Label>
            <Textarea
              id="content"
              name="content"
              required
              rows={10}
              defaultValue={template?.content}
              placeholder={"## Problème\n\n## Solution\n\n## Étapes"}
            />

            {/* La trame passe par le même nettoyage que le contenu d'un article
                (elle est copiée telle quelle dans l'éditeur). */}
            <HtmlPolicyHint profile="article" />
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
