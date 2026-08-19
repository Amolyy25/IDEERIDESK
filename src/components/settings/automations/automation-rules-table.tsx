"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationRuleDialog } from "@/components/settings/automations/automation-rule-dialog";
import { AutomationRuleRow } from "@/components/settings/automations/automation-rule-row";
import { deleteAutomationRule, runAutomationsNow } from "@/lib/actions/automations";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { plural } from "@/lib/utils";
import type {
  AssignableAgent,
  NotifiableGroup,
} from "@/components/settings/automations/rule-actions";
import type { MessageTemplate } from "@/components/settings/automations/rule-messages";

export function AutomationRulesTable({
  rules,
  statuses,
  priorities,
  categories,
  agents,
  groups,
  templates,
}: {
  rules: AutomationRuleWithStatuses[];
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: AssignableAgent[];
  groups: NotifiableGroup[];
  templates: MessageTemplate[];
}) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  async function handleDelete(id: string) {
    try {
      await deleteAutomationRule(id);
      toast.success("Automatisation supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  async function handleRunNow() {
    setIsRunning(true);
    try {
      const result = await runAutomationsNow();
      toast.success(runSummary(result.ticketsProcessed));
      // Une règle écartée est un réglage à corriger, pas un détail de log : sans
      // ce signal, l'admin voit « 0 ticket traité » et croit sa règle inutile.
      if (result.rulesSkipped > 0) {
        toast.warning(
          `${result.rulesSkipped} règle(s) ignorée(s) : statut d'arrivée identique au statut déclencheur.`
        );
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exécution impossible");
    } finally {
      setIsRunning(false);
    }
  }

  const activeCount = rules.filter((rule) => rule.isActive).length;

  const newRuleButton = (
    <AutomationRuleDialog
      statuses={statuses}
      priorities={priorities}
      categories={categories}
      agents={agents}
      groups={groups}
      templates={templates}
      trigger={
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nouvelle automatisation
        </Button>
      }
    />
  );

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div className="max-w-sm">
          <p className="text-sm font-medium">Aucune règle pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Une règle surveille les tickets d&apos;un statut et d&apos;une priorité, et agit seule
            au bout d&apos;un délai. Par exemple : un ticket urgent resté 4 h sans réponse passe en
            retard.
          </p>
        </div>
        <div className="mt-1">{newRuleButton}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">{activeSummary(activeCount, rules.length)}</p>
        <Button size="sm" variant="outline" onClick={handleRunNow} disabled={isRunning}>
          <Play className="h-4 w-4" />
          {isRunning ? "Exécution…" : "Exécuter maintenant"}
        </Button>
        {newRuleButton}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {rules.map((rule) => (
          <AutomationRuleRow
            key={rule.id}
            rule={rule}
            statuses={statuses}
            priorities={priorities}
            categories={categories}
            agents={agents}
            groups={groups}
            templates={templates}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

function runSummary(ticketsProcessed: number) {
  if (ticketsProcessed === 0) return "Aucun ticket ne remplissait les conditions";
  const s = plural(ticketsProcessed);
  return `${ticketsProcessed} ticket${s} traité${s}`;
}

function activeSummary(activeCount: number, total: number) {
  if (activeCount === 0) return "Aucune règle active";
  const s = plural(activeCount);
  return `${activeCount} règle${s} active${s} sur ${total}`;
}
