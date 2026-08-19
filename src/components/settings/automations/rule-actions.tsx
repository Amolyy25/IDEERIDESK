"use client";

import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { ActionToggle, Field } from "@/components/settings/automations/automation-tokens";
import { StatusPicker } from "@/components/settings/automations/status-picker";
import type { useAutomationRuleForm } from "@/components/settings/automations/use-automation-rule-form";

type Form = ReturnType<typeof useAutomationRuleForm>;
export type AssignableAgent = { id: string; name: string };
export type NotifiableGroup = { id: string; name: string };

const UNCHANGED = "__unchanged__";
// Préfixe pour distinguer les deux familles dans une seule liste : les deux
// tables ont leurs propres cuid, rien ne les sépare autrement.
const GROUP_PREFIX = "group:";

export function RuleActions({
  form,
  statuses,
  priorities,
  agents,
  groups,
}: {
  form: Form;
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  agents: AssignableAgent[];
  groups: NotifiableGroup[];
}) {
  const target = form.actionNotifyGroupId
    ? `${GROUP_PREFIX}${form.actionNotifyGroupId}`
    : (form.actionAssigneeId ?? UNCHANGED);

  function changeTarget(value: string) {
    if (value === UNCHANGED) return form.assignTo({});
    if (value.startsWith(GROUP_PREFIX)) {
      return form.assignTo({ groupId: value.slice(GROUP_PREFIX.length) });
    }
    form.assignTo({ agentId: value });
  }
  return (
    <div className="space-y-4">
      <Field
        label="Nouveau statut"
        hint="Obligatoire : c'est ce qui sort le ticket de la règle et l'empêche de se rejouer."
      >
        <StatusPicker
          value={form.actionStatusId}
          onChange={(value) => form.setActionStatusId(value ?? "")}
          // Proposer le statut surveillé reviendrait à offrir la boucle infinie
          // comme option.
          options={statuses.filter((status) => status.id !== form.triggerStatusId)}
          ariaLabel="Nouveau statut"
        />
      </Field>

      <Field label="Priorité">
        <StatusPicker
          value={form.actionPriorityId}
          onChange={form.setActionPriorityId}
          options={priorities}
          ariaLabel="Nouvelle priorité"
          emptyLabel="Ne pas changer"
        />
      </Field>

      <Field
        label="Confier à"
        hint={
          form.actionNotifyGroupId
            ? "Le groupe est prévenu par cloche et e-mail. Le ticket reste non assigné."
            : undefined
        }
      >
        <Select value={target} onValueChange={changeTarget}>
          <SelectTrigger className="h-9 w-full" aria-label="Confier à">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNCHANGED}>
              <span className="text-muted-foreground">Ne pas changer</span>
            </SelectItem>

            {agents.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Assigner à un agent</SelectLabel>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}

            {groups.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Prévenir un groupe</SelectLabel>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={`${GROUP_PREFIX}${group.id}`}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-3 border-t pt-3">
        <ActionToggle
          checked={form.addNote}
          onChange={form.setAddNote}
          label="Laisser une note interne"
        />
        {form.addNote && (
          <Textarea
            rows={3}
            maxLength={2000}
            aria-label="Note interne"
            value={form.noteContent}
            onChange={(event) => form.setNoteContent(event.target.value)}
            placeholder="Sans réponse du client, le ticket a été escaladé automatiquement."
          />
        )}
        <ActionToggle
          checked={form.sendEmail}
          onChange={form.setSendEmail}
          label="Écrire au client"
        />
      </div>
    </div>
  );
}
