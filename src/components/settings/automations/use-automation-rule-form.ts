import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TicketStatus } from "@/generated/prisma/client";
import {
  DEFAULT_DELAY_MINUTES,
  DELAY_PRESETS,
  MAX_DELAY_MINUTES,
  MIN_DELAY_MINUTES,
  delayToMinutes,
  splitDelay,
  type DelayUnit,
} from "@/lib/automation-delay";
import { isReplyHtmlEmpty } from "@/lib/reply-html";
import type { GeneratedRuleDraft } from "@/lib/ai-automation-rule";
import { generateRuleFromDescription } from "@/lib/api/automations";
import { createAutomationRule, updateAutomationRule } from "@/lib/actions/automations";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";

export function useAutomationRuleForm({
  rule,
  statuses,
  onSaved,
}: {
  rule?: AutomationRuleWithStatuses;
  statuses: TicketStatus[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState(rule?.name ?? "");
  const [triggerStatusId, setTriggerStatusId] = useState(
    rule?.triggerStatusId ?? statuses[0]?.id ?? ""
  );
  // Le statut d'arrivée démarre sur le premier statut *différent* du
  // déclencheur : deux valeurs identiques créeraient une règle en boucle.
  const [actionStatusId, setActionStatusId] = useState(
    rule?.actionStatusId ?? statuses.find((status) => status.id !== statuses[0]?.id)?.id ?? ""
  );
  const [priorityIds, setPriorityIds] = useState<string[]>(rule?.triggerPriorityIds ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(rule?.triggerCategoryIds ?? []);
  const [onlyUnanswered, setOnlyUnanswered] = useState(rule?.onlyUnanswered ?? false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(rule?.onlyUnassigned ?? false);
  const [onlyBreachedSla, setOnlyBreachedSla] = useState(rule?.onlyBreachedSla ?? false);
  const [actionPriorityId, setActionPriorityId] = useState(rule?.actionPriorityId ?? null);
  const [actionAssigneeId, setActionAssigneeId] = useState(rule?.actionAssigneeId ?? null);
  const [actionNotifyGroupId, setActionNotifyGroupId] = useState(
    rule?.actionNotifyGroupId ?? null
  );
  const [addNote, setAddNote] = useState(rule?.addNote ?? true);
  const [noteContent, setNoteContent] = useState(rule?.noteContent ?? "");
  const [sendEmail, setSendEmail] = useState(rule?.sendEmail ?? false);
  const [emailHtml, setEmailHtml] = useState(rule?.emailHtml ?? "");
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);

  const [delay, setDelay] = useState(() => splitDelay(rule?.delayMinutes ?? DEFAULT_DELAY_MINUTES));
  // Un délai qui ne tombe sur aucun raccourci ouvre d'emblée la saisie libre,
  // sinon rouvrir la règle afficherait un délai qu'aucun chip ne montre.
  const [isCustomDelay, setIsCustomDelay] = useState(
    () => !DELAY_PRESETS.includes(rule?.delayMinutes ?? DEFAULT_DELAY_MINUTES)
  );

  const [isGenerating, setIsGenerating] = useState(false);

  const delayMinutes = delayToMinutes(delay.value, delay.unit);
  const delayError =
    delayMinutes < MIN_DELAY_MINUTES || delayMinutes > MAX_DELAY_MINUTES
      ? `Le délai doit tenir entre ${MIN_DELAY_MINUTES} minutes et 365 jours.`
      : null;
  const emailError =
    sendEmail && isReplyHtmlEmpty(emailHtml) ? "Écrivez le message à envoyer au client." : null;

  // Choisir comme déclencheur le statut déjà en arrivée décale l'arrivée plutôt
  // que de laisser le formulaire dans un état refusé au submit.
  function changeTriggerStatus(nextId: string) {
    setTriggerStatusId(nextId);
    if (nextId === actionStatusId) {
      setActionStatusId(statuses.find((status) => status.id !== nextId)?.id ?? "");
    }
  }

  function applyDelayMinutes(minutes: number) {
    setDelay(splitDelay(minutes));
    setIsCustomDelay(!DELAY_PRESETS.includes(minutes));
  }

  /**
   * Un ticket n'a qu'un assigné : désigner un groupe veut dire « prévenir cette
   * équipe, sans assigner ». Les deux volets ne peuvent donc pas coexister.
   */
  function assignTo(target: { agentId?: string | null; groupId?: string | null }) {
    setActionAssigneeId(target.agentId ?? null);
    setActionNotifyGroupId(target.groupId ?? null);
  }

  function toggleIn(current: string[], id: string) {
    return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
  }

  /** Le brouillon de l'IA ne remplace que ce qu'elle a su résoudre. */
  function applyDraft(draft: GeneratedRuleDraft) {
    if (draft.name) setName(draft.name);
    if (draft.triggerStatusId) changeTriggerStatus(draft.triggerStatusId);
    // Statut surveillé non reconnu : celui du formulaire reste en place, et
    // l'arrivée proposée pourrait tomber dessus — le serveur refuserait la règle.
    const trigger = draft.triggerStatusId ?? triggerStatusId;
    if (draft.actionStatusId && draft.actionStatusId !== trigger) {
      setActionStatusId(draft.actionStatusId);
    }
    if (draft.delayMinutes) applyDelayMinutes(draft.delayMinutes);
    setPriorityIds(draft.triggerPriorityIds);
    setCategoryIds(draft.triggerCategoryIds);
    setOnlyUnanswered(draft.onlyUnanswered);
    setOnlyUnassigned(draft.onlyUnassigned);
    setOnlyBreachedSla(draft.onlyBreachedSla);
    setActionPriorityId(draft.actionPriorityId);
    if (draft.actionAssigneeId) {
      assignTo({ agentId: draft.actionAssigneeId });
    } else {
      assignTo({ groupId: draft.actionNotifyGroupId });
    }
    setAddNote(draft.addNote);
    if (draft.noteContent) setNoteContent(draft.noteContent);
    setSendEmail(draft.sendEmail);
    if (draft.emailHtml) setEmailHtml(draft.emailHtml);
  }

  async function generate(description: string) {
    setIsGenerating(true);
    try {
      const draft = await generateRuleFromDescription(description);
      applyDraft(draft);
      if (draft.unresolved.length > 0) {
        toast.warning(`À vérifier, non reconnu : ${draft.unresolved.join(", ")}.`);
      } else {
        toast.success("Règle proposée, relisez-la avant d'enregistrer");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de générer la règle.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function submit() {
    // Entrée dans un champ texte soumet aussi le formulaire : le bouton désactivé
    // ne suffit pas à empêcher un double envoi.
    if (isSubmitting) return;

    const blocking = delayError ?? emailError;
    if (blocking) {
      toast.error(blocking);
      return;
    }

    setIsSubmitting(true);
    try {
      const input = {
        name,
        isActive,
        delayMinutes,
        triggerStatusId,
        triggerPriorityIds: priorityIds,
        triggerCategoryIds: categoryIds,
        onlyUnanswered,
        onlyUnassigned,
        onlyBreachedSla,
        actionStatusId,
        actionPriorityId,
        actionAssigneeId,
        actionNotifyGroupId,
        addNote,
        noteContent,
        sendEmail,
        emailHtml: sendEmail ? emailHtml : null,
      };

      if (rule) {
        await updateAutomationRule(rule.id, input);
      } else {
        await createAutomationRule(input);
      }
      toast.success(rule ? "Automatisation mise à jour" : "Automatisation créée");
      onSaved();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    name,
    setName,
    triggerStatusId,
    changeTriggerStatus,
    actionStatusId,
    setActionStatusId,
    priorityIds,
    togglePriority: (id: string) => setPriorityIds((current) => toggleIn(current, id)),
    clearPriorities: () => setPriorityIds([]),
    categoryIds,
    toggleCategory: (id: string) => setCategoryIds((current) => toggleIn(current, id)),
    clearCategories: () => setCategoryIds([]),
    onlyUnanswered,
    setOnlyUnanswered,
    onlyUnassigned,
    setOnlyUnassigned,
    onlyBreachedSla,
    setOnlyBreachedSla,
    actionPriorityId,
    setActionPriorityId,
    actionAssigneeId,
    actionNotifyGroupId,
    assignTo,
    addNote,
    setAddNote,
    noteContent,
    setNoteContent,
    sendEmail,
    setSendEmail,
    emailHtml,
    setEmailHtml,
    isActive,
    setIsActive,
    delay,
    delayMinutes,
    isCustomDelay,
    selectPreset: applyDelayMinutes,
    openCustomDelay: () => setIsCustomDelay(true),
    setDelayValue: (value: number) => setDelay((current) => ({ ...current, value })),
    setDelayUnit: (unit: DelayUnit) => setDelay((current) => ({ ...current, unit })),
    delayError,
    emailError,
    isGenerating,
    generate,
    isSubmitting,
    submit,
  };
}
