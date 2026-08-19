"use client";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/client";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import { useAutomationRuleForm } from "@/components/settings/automations/use-automation-rule-form";
import { RuleAiBar } from "@/components/settings/automations/rule-ai-bar";
import { RuleConditions } from "@/components/settings/automations/rule-conditions";
import {
  RuleActions,
  type AssignableAgent,
  type NotifiableGroup,
} from "@/components/settings/automations/rule-actions";
import {
  RuleMessages,
  type MessageTemplate,
} from "@/components/settings/automations/rule-messages";

export function AutomationRuleForm({
  rule,
  statuses,
  priorities,
  categories,
  agents,
  groups,
  templates,
  onSaved,
}: {
  rule?: AutomationRuleWithStatuses;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: AssignableAgent[];
  groups: NotifiableGroup[];
  templates: MessageTemplate[];
  onSaved: () => void;
}) {
  const form = useAutomationRuleForm({ rule, statuses, onSaved });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-xs text-muted-foreground">
          Nom de la règle
        </Label>
        <Input
          id="name"
          required
          maxLength={120}
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          placeholder="Escalade des urgents sans réponse"
        />
      </div>

      <RuleAiBar onGenerate={form.generate} isGenerating={form.isGenerating} />

      {/* Deux colonnes : la condition et sa conséquence se lisent d'un seul
          regard, au lieu d'être séparées par un écran de défilement. */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Column title="Quand" subtitle="Les tickets que la règle surveille">
          <RuleConditions
            form={form}
            statuses={statuses}
            priorities={priorities}
            categories={categories}
          />
        </Column>
        <Column title="Alors" subtitle="Ce qu'elle fait, seule">
          <RuleActions
            form={form}
            statuses={statuses}
            priorities={priorities}
            agents={agents}
            groups={groups}
          />
        </Column>
      </div>

      <RuleMessages form={form} templates={templates} />

      <DialogFooter className="items-center gap-4 sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={form.isActive} onCheckedChange={form.setIsActive} />
          Règle active
        </label>
        <Button
          type="submit"
          disabled={form.isSubmitting || Boolean(form.delayError) || Boolean(form.emailError)}
        >
          {form.isSubmitting ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Column({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="border-l-2 border-primary/40 pl-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
