"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Mail, Pencil, StickyNote, Trash2, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AutomationRuleDialog } from "@/components/settings/automations/automation-rule-dialog";
import { Token } from "@/components/settings/automations/automation-tokens";
import {
  describeRule,
  rulePriorities,
} from "@/components/settings/automations/automation-rule.utils";
import { toggleAutomationRule } from "@/lib/actions/automations";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/client";
import type {
  AssignableAgent,
  NotifiableGroup,
} from "@/components/settings/automations/rule-actions";
import type { MessageTemplate } from "@/components/settings/automations/rule-messages";
import { formatSlaTarget } from "@/lib/sla";
import { formatRelativeDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export function AutomationRuleRow({
  rule,
  statuses,
  priorities,
  categories,
  agents,
  groups,
  templates,
  onDelete,
}: {
  rule: AutomationRuleWithStatuses;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: AssignableAgent[];
  groups: NotifiableGroup[];
  templates: MessageTemplate[];
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const scoped = rulePriorities(rule.triggerPriorityIds, priorities);
  const filters = [
    rule.onlyUnanswered && "sans réponse",
    rule.onlyUnassigned && "non assigné",
    rule.onlyBreachedSla && "SLA dépassé",
  ].filter(Boolean) as string[];

  function toggle(isActive: boolean) {
    startTransition(async () => {
      try {
        await toggleAutomationRule(rule.id, isActive);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Modification impossible");
      }
    });
  }

  return (
    <div className="group flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30">
      <Switch
        checked={rule.isActive}
        onCheckedChange={toggle}
        disabled={isPending}
        className="mt-1"
        aria-label={`${rule.isActive ? "Désactiver" : "Activer"} « ${rule.name} »`}
      />

      <div className={cn("min-w-0 flex-1 space-y-1.5", !rule.isActive && "opacity-50")}>
        <div className="flex items-baseline gap-3">
          <p className="truncate text-sm font-medium">{rule.name}</p>
          <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {rule.lastRunAt ? `exécutée ${formatRelativeDate(rule.lastRunAt)}` : "jamais exécutée"}
          </span>
        </div>

        {/* Même phrase que dans le constructeur, pour relire une règle sans
            rouvrir le dialogue. */}
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          title={
            describeRule({
              triggerStatusName: rule.triggerStatus.name,
              priorityNames: scoped.map((priority) => priority.name),
              delayMinutes: rule.delayMinutes,
              actionStatusName: rule.actionStatus.name,
            }) ?? undefined
          }
        >
          <Token color={rule.triggerStatus.color} className="text-xs">
            {rule.triggerStatus.name}
          </Token>
          {scoped.length > 0 ? (
            scoped.map((priority) => (
              <Token key={priority.id} color={priority.color} className="text-xs">
                {priority.name}
              </Token>
            ))
          ) : (
            <span>toutes priorités</span>
          )}
          <span>sans activité depuis {formatSlaTarget(rule.delayMinutes)}</span>
          {filters.map((filter) => (
            <span key={filter} className="rounded bg-muted px-1.5 py-0.5">
              {filter}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <ArrowRight className="size-3.5" aria-hidden />
            <Token color={rule.actionStatus.color} className="text-xs">
              {rule.actionStatus.name}
            </Token>
          </span>
          {rule.actionPriority && (
            <Token color={rule.actionPriority.color} className="text-xs">
              {rule.actionPriority.name}
            </Token>
          )}
          {rule.actionAssignee && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <UserCheck className="size-3.5" aria-hidden />
              {rule.actionAssignee.name}
            </span>
          )}
          {rule.actionNotifyGroup && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title={`${rule.actionNotifyGroup.name} est prévenu par cloche et e-mail, sans assignation`}
            >
              <Users className="size-3.5" aria-hidden />
              {rule.actionNotifyGroup.name}
            </span>
          )}
          {rule.addNote && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title="Ajoute une note interne"
            >
              <StickyNote className="size-3.5" aria-hidden />
              note
            </span>
          )}
          {rule.sendEmail && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title="Envoie un e-mail au client"
            >
              <Mail className="size-3.5" aria-hidden />
              e-mail
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <AutomationRuleDialog
          rule={rule}
          statuses={statuses}
          priorities={priorities}
          categories={categories}
          agents={agents}
          groups={groups}
          templates={templates}
          trigger={
            <Button size="icon" variant="ghost" aria-label={`Modifier « ${rule.name} »`}>
              <Pencil className="size-4" />
            </Button>
          }
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`Supprimer « ${rule.name} »`}>
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer « {rule.name} » ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les tickets déjà traités par cette règle gardent leur statut. Cette action est
                irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(rule.id)}>Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
