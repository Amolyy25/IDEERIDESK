"use client";

import type { CustomField } from "@/generated/prisma/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomFieldInput({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Dense styling for the agent-side sidebar; the public widget uses the default, more readable size. */
  compact?: boolean;
}) {
  const options = Array.isArray(field.options) ? (field.options as string[]) : [];

  return (
    <div className="space-y-2">
      <Label className={cn(compact && "text-xs text-muted-foreground")}>
        {field.label}
        {field.isRequired && <span className="text-primary"> *</span>}
      </Label>

      {field.type === "TEXT" && (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "TEXTAREA" && (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )}

      {field.type === "DROPDOWN" && (
        <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sélectionner…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "CHECKBOX" && (
        <div className="flex items-center gap-2">
          <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />
          <span className="text-sm text-muted-foreground">Activé</span>
        </div>
      )}

      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
    </div>
  );
}
