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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCustomField, updateCustomField } from "@/lib/actions/custom-fields";
import type { CustomField, CustomFieldType } from "@/generated/prisma/client";

const typeLabels: Record<CustomFieldType, string> = {
  TEXT: "Texte",
  TEXTAREA: "Texte long",
  DROPDOWN: "Liste déroulante",
  CHECKBOX: "Case à cocher",
};

export function CustomFieldDialog({
  field,
  trigger,
}: {
  field?: CustomField;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
  const isEditing = Boolean(field);

  const initialOptions = Array.isArray(field?.options) ? (field.options as string[]) : [];

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const optionsRaw = formData.get("options") as string;
      const options = optionsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const input = {
        label: formData.get("label") as string,
        type,
        options,
        helpText: (formData.get("helpText") as string) || null,
        autofillFromSourceUrl: formData.get("autofillFromSourceUrl") === "on",
        isRequired: formData.get("isRequired") === "on",
        isActive: formData.get("isActive") === "on",
      };

      if (field) {
        await updateCustomField(field.id, input);
      } else {
        await createCustomField(input);
      }
      toast.success(isEditing ? "Champ mis à jour" : "Champ créé");
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
            <DialogTitle>
              {isEditing ? "Modifier le champ personnalisé" : "Nouveau champ personnalisé"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="label">Libellé</Label>
            <Input id="label" name="label" required maxLength={60} defaultValue={field?.label} />
          </div>

          <div className="space-y-2">
            <Label>Type de champ</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "DROPDOWN" && (
            <div className="space-y-2">
              <Label htmlFor="options">Options (une par ligne)</Label>
              <Textarea
                id="options"
                name="options"
                rows={4}
                defaultValue={initialOptions.join("\n")}
                placeholder={"Option A\nOption B"}
              />
            </div>
          )}
          {type !== "DROPDOWN" && <input type="hidden" name="options" value="" />}

          <div className="space-y-2">
            <Label htmlFor="helpText">Texte d&apos;aide (optionnel)</Label>
            <Textarea
              id="helpText"
              name="helpText"
              rows={2}
              maxLength={300}
              defaultValue={field?.helpText ?? ""}
              placeholder="Affiché en petit sous le champ, ex. précisions ou consignes."
            />
          </div>

          {type === "TEXT" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="autofillFromSourceUrl"
                name="autofillFromSourceUrl"
                defaultChecked={field?.autofillFromSourceUrl}
              />
              <Label
                htmlFor="autofillFromSourceUrl"
                className="text-sm font-normal text-muted-foreground"
              >
                Pré-remplir avec l&apos;URL de la page (widget uniquement)
              </Label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="isRequired" name="isRequired" defaultChecked={field?.isRequired} />
            <Label htmlFor="isRequired" className="text-sm font-normal text-muted-foreground">
              Champ obligatoire
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isActive" name="isActive" defaultChecked={field?.isActive ?? true} />
            <Label htmlFor="isActive" className="text-sm font-normal text-muted-foreground">
              Visible sur les tickets
            </Label>
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
