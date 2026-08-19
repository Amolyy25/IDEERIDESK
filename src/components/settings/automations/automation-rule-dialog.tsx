"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/client";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import { AutomationRuleForm } from "@/components/settings/automations/automation-rule-form";
import type {
  AssignableAgent,
  NotifiableGroup,
} from "@/components/settings/automations/rule-actions";
import type { MessageTemplate } from "@/components/settings/automations/rule-messages";

export function AutomationRuleDialog({
  rule,
  statuses,
  priorities,
  categories,
  agents,
  groups,
  templates,
  trigger,
}: {
  rule?: AutomationRuleWithStatuses;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: AssignableAgent[];
  groups: NotifiableGroup[];
  templates: MessageTemplate[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Le formulaire vit dans un enfant démonté à la fermeture : son état
          repart de la règle enregistrée à chaque ouverture, au lieu de garder
          les saisies d'un dialogue annulé. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Modifier l'automatisation" : "Nouvelle automatisation"}
          </DialogTitle>
        </DialogHeader>
        <AutomationRuleForm
          rule={rule}
          statuses={statuses}
          priorities={priorities}
          categories={categories}
          agents={agents}
          groups={groups}
          templates={templates}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
