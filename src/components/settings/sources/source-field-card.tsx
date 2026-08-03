"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  isDecorativeField,
  sourceFieldTypeLabels,
  type SourceFormField,
} from "@/lib/sources";

/**
 * Un champ du formulaire dans le panneau de gauche : repliée, la carte se lit
 * comme une ligne de liste ; dépliée, elle expose les réglages du champ.
 */
export function SourceFieldCard({
  field,
  index,
  count,
  isDragging,
  onChange,
  onMove,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  field: SourceFormField;
  index: number;
  count: number;
  isDragging: boolean;
  onChange: (patch: Partial<SourceFormField>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const decorative = isDecorativeField(field.type);

  function updateOption(optionIndex: number, value: string) {
    onChange({
      options: field.options.map((option, i) => (i === optionIndex ? value : option)),
    });
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border bg-card transition-all",
        isDragging ? "opacity-40" : "hover:border-foreground/20",
      )}
    >
      <div className="flex items-center gap-1.5 p-2 pl-1">
        <span
          draggable
          onDragStart={onDragStart}
          className="cursor-grab p-1 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
          title="Glisser pour réordonner"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm font-medium">
            {field.label || "Sans libellé"}
            {field.isRequired && !decorative && <span className="text-primary"> *</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {sourceFieldTypeLabels[field.type]}
          </span>
        </button>

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            title="Monter"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            title="Descendre"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onRemove}
            title="Supprimer ce champ"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-4 border-t px-3 py-4">
          <div className="space-y-2">
            <Label>{decorative ? "Titre de la section" : "Libellé"}</Label>
            <Input
              value={field.label}
              maxLength={80}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </div>

          {!decorative && (
            <div className="space-y-2">
              <Label>
                {field.type === "CHECKBOX"
                  ? "Texte à côté de la case"
                  : field.type === "FILE"
                    ? "Texte du bouton"
                    : "Texte d'aide dans le champ"}
              </Label>
              <Input
                value={field.placeholder ?? ""}
                maxLength={160}
                placeholder={
                  field.type === "CHECKBOX"
                    ? "Oui"
                    : field.type === "FILE"
                      ? "Choisir un fichier"
                      : "Ex. Numéro de mandat"
                }
                onChange={(event) => onChange({ placeholder: event.target.value || null })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Précision affichée sous le champ</Label>
            <Textarea
              value={field.helpText ?? ""}
              rows={2}
              maxLength={300}
              onChange={(event) => onChange({ helpText: event.target.value || null })}
            />
          </div>

          {field.type === "SELECT" && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="space-y-2">
                {field.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <Input
                      value={option}
                      maxLength={80}
                      placeholder={`Option ${optionIndex + 1}`}
                      onChange={(event) => updateOption(optionIndex, event.target.value)}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        onChange({ options: field.options.filter((_, i) => i !== optionIndex) })
                      }
                      title="Retirer cette option"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={field.options.length >= 40}
                onClick={() => onChange({ options: [...field.options, ""] })}
              >
                <Plus className="size-4" />
                Ajouter une option
              </Button>
            </div>
          )}

          {!decorative && (
            <div className="flex items-center justify-between gap-4 rounded-md border px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium">Obligatoire</p>
                <p className="text-xs text-muted-foreground">
                  {field.type === "FILE"
                    ? "Au moins un fichier doit être joint."
                    : "Le formulaire refuse l'envoi si le champ est vide."}
                </p>
              </div>
              <Switch
                checked={field.isRequired}
                onCheckedChange={(checked) => onChange({ isRequired: checked })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
