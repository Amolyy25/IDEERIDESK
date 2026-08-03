"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Play, ArrowRight, StickyNote, Mail, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { StatusDot } from "@/components/tickets/status-dot";
import { AutomationRuleDialog } from "@/components/settings/automations/automation-rule-dialog";
import { deleteAutomationRule, runAutomationsNow } from "@/lib/actions/automations";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import type { TicketStatus } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export function AutomationRulesTable({
  rules,
  statuses,
}: {
  rules: AutomationRuleWithStatuses[];
  statuses: TicketStatus[];
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
      toast.success(`${result.ticketsProcessed} ticket(s) traité(s)`);
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

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucune automatisation configurée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fermez par exemple les tickets restés trop longtemps « En attente client ».
          </p>
        </div>
        <AutomationRuleDialog
          statuses={statuses}
          trigger={
            <Button size="sm" className="mt-1">
              <Plus className="h-4 w-4" />
              Nouvelle automatisation
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={handleRunNow} disabled={isRunning}>
          <Play className="h-4 w-4" />
          {isRunning ? "Exécution…" : "Exécuter maintenant"}
        </Button>
        <AutomationRuleDialog
          statuses={statuses}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle automatisation
            </Button>
          }
        />
      </div>

      <div className="rounded-lg border">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className={cn(
              "group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40",
              index > 0 && "border-t",
              !rule.isActive && "opacity-60"
            )}
          >
            <div className="min-w-40 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {rule.name}
                {!rule.isActive && <Badge variant="outline">Inactive</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {rule.lastRunAt
                  ? `Dernière exécution ${formatDateTime(rule.lastRunAt)}`
                  : "Jamais exécutée"}
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-sm">
              <StatusDot color={rule.triggerStatus.color} label={rule.triggerStatus.name} />
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {rule.delayDays}j
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <StatusDot color={rule.actionStatus.color} label={rule.actionStatus.name} />
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              {rule.addNote && (
                <span title="Ajoute une note interne">
                  <StickyNote className="h-3.5 w-3.5" />
                </span>
              )}
              {rule.sendEmail && (
                <span title="Envoie un e-mail au client">
                  <Mail className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
              <AutomationRuleDialog
                rule={rule}
                statuses={statuses}
                trigger={
                  <Button size="icon" variant="ghost">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cette automatisation ?</AlertDialogTitle>
                    <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(rule.id)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
