"use client";

import { useId } from "react";
import { Paperclip } from "lucide-react";
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
import type { SourceFormField } from "@/lib/sources";

/**
 * Rendu d'un champ configuré dans le form builder. Utilisé tel quel par le
 * formulaire public et par l'aperçu en direct des réglages : ce que voit
 * l'administrateur est littéralement ce que verra le visiteur.
 */
export function SourceFieldInput({
  field,
  value,
  onChange,
  onFiles,
  disabled = false,
}: {
  field: SourceFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Fichiers choisis sur un champ de type FILE (rejoignent les pièces jointes). */
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
}) {
  const id = useId();

  if (field.type === "HEADER") {
    return (
      <div className="pt-1">
        <p className="text-sm font-medium">{field.label}</p>
        {field.helpText && (
          <p className="mt-0.5 text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {field.label}
        {field.isRequired && <span className="text-primary"> *</span>}
      </Label>

      {field.type === "TEXT" && (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder ?? undefined}
          disabled={disabled}
          className="h-10"
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.type === "TEXTAREA" && (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder ?? undefined}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.type === "SELECT" && (
        <Select
          value={typeof value === "string" && value ? value : undefined}
          disabled={disabled}
          onValueChange={onChange}
        >
          <SelectTrigger id={id} className="h-10 w-full">
            <SelectValue placeholder={field.placeholder ?? "Sélectionner…"} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "CHECKBOX" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
            {field.placeholder || "Oui"}
          </Label>
        </div>
      )}

      {field.type === "FILE" && (
        <label
          className={
            "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3.5 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground" +
            (disabled ? " pointer-events-none" : "")
          }
        >
          <Paperclip className="h-4 w-4" />
          {field.placeholder || "Choisir un fichier"}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              if (event.target.files) onFiles?.(Array.from(event.target.files));
              event.target.value = "";
            }}
          />
        </label>
      )}

      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
    </div>
  );
}
