"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Pastilles partagées entre le constructeur et la liste : une priorité se lit
// pareil qu'on écrive la règle ou qu'on la relise.

export function Token({
  color,
  children,
  className,
}: {
  color?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-sm font-medium text-foreground",
        className
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </span>
  );
}

/** Chip cliquable. L'ambre ne sert qu'à dire « ceci fait partie de la règle ». */
export function Choice({
  selected,
  color,
  onClick,
  children,
}: {
  selected: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        selected
          ? "border-primary bg-primary/15 font-medium text-foreground"
          : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {color && (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", !selected && "opacity-50")}
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}

/** Un intitulé et son contrôle. Reprend le rythme des deux colonnes du dialogue. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/** Case à cocher d'un filtre, avec sa justification sous le libellé. */
export function FilterToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span className="space-y-0.5">
        <span className={cn("block text-sm", labelTone(checked))}>{label}</span>
        <span className="block text-xs text-muted-foreground/80">{hint}</span>
      </span>
    </label>
  );
}

/** Un volet d'action qu'on retient ou non. */
export function ActionToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className={labelTone(checked)}>{label}</span>
    </label>
  );
}

/** Un réglage non retenu reste lisible mais s'efface : il ne décrit pas la règle. */
function labelTone(checked: boolean) {
  if (checked) return "text-foreground";
  return "text-muted-foreground";
}
