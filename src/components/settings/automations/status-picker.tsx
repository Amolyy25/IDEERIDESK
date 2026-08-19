"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Colored = { id: string; name: string; color: string };

/** Liste déroulante avec pastille de couleur, pour un statut ou une priorité. */
const NONE = "__none__";

/** Radix veut une chaîne : « rien choisi » se dit NONE, ou vide s'il n'y a pas d'entrée pour ça. */
function currentValue(value: string | null, hasEmptyOption: boolean) {
  if (value) return value;
  if (hasEmptyOption) return NONE;
  return "";
}

export function StatusPicker({
  value,
  onChange,
  options,
  ariaLabel,
  emptyLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: Colored[];
  ariaLabel: string;
  /** Si fourni, ajoute une entrée « ne pas y toucher » en tête de liste. */
  emptyLabel?: string;
}) {
  return (
    <Select
      value={currentValue(value, Boolean(emptyLabel))}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
    >
      <SelectTrigger className="h-9 w-full" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{emptyLabel}</span>
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              {option.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
