"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { DELAY_PRESETS, DELAY_UNITS, type DelayUnit } from "@/lib/automation-delay";
import { formatSlaTarget } from "@/lib/sla";
import { Choice, Field, FilterToggle } from "@/components/settings/automations/automation-tokens";
import { StatusPicker } from "@/components/settings/automations/status-picker";
import type { useAutomationRuleForm } from "@/components/settings/automations/use-automation-rule-form";

type Form = ReturnType<typeof useAutomationRuleForm>;

export function RuleConditions({
  form,
  statuses,
  priorities,
  categories,
}: {
  form: Form;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
}) {
  return (
    <div className="space-y-4">
      <Field label="Statut surveillé">
        <StatusPicker
          value={form.triggerStatusId}
          onChange={(value) => form.changeTriggerStatus(value ?? "")}
          options={statuses}
          ariaLabel="Statut surveillé"
        />
      </Field>

      <Field label="Priorités">
        <div className="flex flex-wrap gap-1.5">
          <Choice selected={form.priorityIds.length === 0} onClick={form.clearPriorities}>
            Toutes
          </Choice>
          {priorities.map((priority) => (
            <Choice
              key={priority.id}
              color={priority.color}
              selected={form.priorityIds.includes(priority.id)}
              onClick={() => form.togglePriority(priority.id)}
            >
              {priority.name}
            </Choice>
          ))}
        </div>
      </Field>

      {categories.length > 0 && (
        <Field label="Produits">
          <div className="flex flex-wrap gap-1.5">
            <Choice selected={form.categoryIds.length === 0} onClick={form.clearCategories}>
              Tous
            </Choice>
            {categories.map((category) => (
              <Choice
                key={category.id}
                color={category.color}
                selected={form.categoryIds.includes(category.id)}
                onClick={() => form.toggleCategory(category.id)}
              >
                {category.name}
              </Choice>
            ))}
          </div>
        </Field>
      )}

      <Field label="Immobile depuis">
        <div className="flex flex-wrap gap-1.5">
          {DELAY_PRESETS.map((preset) => (
            <Choice
              key={preset}
              selected={!form.isCustomDelay && form.delayMinutes === preset}
              onClick={() => form.selectPreset(preset)}
            >
              {formatSlaTarget(preset)}
            </Choice>
          ))}
          <Choice selected={form.isCustomDelay} onClick={form.openCustomDelay}>
            Autre…
          </Choice>
        </div>
        {form.isCustomDelay && (
          <div className="flex gap-2 pt-1">
            <Input
              type="number"
              min={1}
              aria-label="Valeur du délai"
              className="h-8 w-20"
              value={form.delay.value}
              onChange={(event) => form.setDelayValue(Number(event.target.value))}
            />
            <Select
              value={form.delay.unit}
              onValueChange={(unit) => form.setDelayUnit(unit as DelayUnit)}
            >
              <SelectTrigger className="h-8 w-32" aria-label="Unité du délai">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELAY_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.delayError && <p className="text-xs text-destructive">{form.delayError}</p>}
      </Field>

      <div className="space-y-2.5 border-t pt-3">
        <FilterToggle
          checked={form.onlyUnanswered}
          onChange={form.setOnlyUnanswered}
          label="Seulement si personne n'a répondu au client"
          hint="Une note interne ou un changement de statut ne compte pas comme une réponse."
        />
        <FilterToggle
          checked={form.onlyUnassigned}
          onChange={form.setOnlyUnassigned}
          label="Seulement si le ticket n'est assigné à personne"
          hint="Pour rattraper ce qui n'a jamais été pris en charge."
        />
        <FilterToggle
          checked={form.onlyBreachedSla}
          onChange={form.setOnlyBreachedSla}
          label="Seulement si le délai SLA est dépassé"
          hint="Ignore les tickets dont l'horloge est suspendue ou sans engagement."
        />
      </div>
    </div>
  );
}
