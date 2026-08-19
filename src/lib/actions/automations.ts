"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { runAutomations } from "@/lib/automations";
import { MAX_DELAY_MINUTES, MIN_DELAY_MINUTES } from "@/lib/automation-delay";
import { sanitizeReplyHtml } from "@/lib/sanitize-html";
import { htmlToText } from "@/lib/html-to-text";
import { isReplyHtmlEmpty } from "@/lib/reply-html";
import type { Prisma } from "@/generated/prisma/client";

const ruleInclude = {
  triggerStatus: true,
  actionStatus: true,
  actionPriority: true,
  actionAssignee: { select: { id: true, name: true } },
  actionNotifyGroup: { select: { id: true, name: true, color: true } },
} satisfies Prisma.AutomationRuleInclude;

export type AutomationRuleWithStatuses = Prisma.AutomationRuleGetPayload<{
  include: typeof ruleInclude;
}>;

export async function getAutomationRules() {
  await requirePermission("settings.workspace");
  return prisma.automationRule.findMany({ include: ruleInclude, orderBy: { createdAt: "asc" } });
}

const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "Nom requis").max(120),
    isActive: z.boolean(),
    delayMinutes: z.number().int().min(MIN_DELAY_MINUTES).max(MAX_DELAY_MINUTES),
    triggerStatusId: z.string().min(1),
    triggerPriorityIds: z.array(z.string().min(1)).max(50),
    triggerCategoryIds: z.array(z.string().min(1)).max(50),
    onlyUnanswered: z.boolean(),
    onlyUnassigned: z.boolean(),
    onlyBreachedSla: z.boolean(),
    actionStatusId: z.string().min(1),
    actionPriorityId: z.string().min(1).nullable(),
    actionAssigneeId: z.string().min(1).nullable(),
    actionNotifyGroupId: z.string().min(1).nullable(),
    addNote: z.boolean(),
    noteContent: z.string().trim().max(2000),
    sendEmail: z.boolean(),
    emailHtml: z.string().trim().max(20000).optional().nullable(),
  })
  // Un ticket n'a qu'un assigné : « confier à un groupe » se traduit par une
  // alerte au groupe, pas par une assignation. Les deux volets s'excluent donc,
  // et le formulaire n'en propose qu'un seul contrôle.
  .refine((data) => !(data.actionAssigneeId && data.actionNotifyGroupId), {
    message: "Choisissez un agent OU un groupe à prévenir, pas les deux.",
    path: ["actionAssigneeId"],
  })
  // Un envoi sans message part vide chez le client. Le refuser ici plutôt que
  // de laisser le moteur sauter l'email en silence à chaque passage.
  .refine((data) => !data.sendEmail || !isReplyHtmlEmpty(data.emailHtml ?? ""), {
    message: "Écrivez le message à envoyer, ou désactivez l'e-mail au client.",
    path: ["emailHtml"],
  })
  // Une règle dont le statut d'arrivée est aussi son statut déclencheur ne sort
  // jamais ses tickets de son propre filtre : chaque passage du cron les
  // re-traite et renvoie note et email au client, indéfiniment.
  .refine((data) => data.actionStatusId !== data.triggerStatusId, {
    message:
      "Le statut d'arrivée doit être différent du statut déclencheur, sinon la règle se rejoue sans fin sur les mêmes tickets.",
    path: ["actionStatusId"],
  });

// L'email part en multipart : on stocke les deux formes, le texte dérivé du HTML.
function ruleData(data: z.infer<typeof ruleSchema>) {
  const written = data.emailHtml ?? "";
  const emailHtml = isReplyHtmlEmpty(written) ? null : sanitizeReplyHtml(written);
  return {
    ...data,
    emailHtml,
    emailContent: emailHtml ? htmlToText(emailHtml) : null,
  };
}

export async function createAutomationRule(input: z.infer<typeof ruleSchema>) {
  await requirePermission("settings.workspace");
  await prisma.automationRule.create({ data: ruleData(ruleSchema.parse(input)) });
  revalidatePath("/settings/automations");
}

export async function updateAutomationRule(id: string, input: z.infer<typeof ruleSchema>) {
  await requirePermission("settings.workspace");
  await prisma.automationRule.update({ where: { id }, data: ruleData(ruleSchema.parse(input)) });
  revalidatePath("/settings/automations");
}

// À part de `updateAutomationRule` : basculer une règle ne doit pas exiger de
// réenvoyer, donc de revalider, tout son paramétrage.
export async function toggleAutomationRule(id: string, isActive: boolean) {
  await requirePermission("settings.workspace");
  await prisma.automationRule.update({ where: { id }, data: { isActive } });
  revalidatePath("/settings/automations");
}

export async function deleteAutomationRule(id: string) {
  await requirePermission("settings.workspace");
  await prisma.automationRule.delete({ where: { id } });
  revalidatePath("/settings/automations");
}

export async function runAutomationsNow() {
  await requirePermission("settings.workspace");
  const result = await runAutomations();
  revalidatePath("/settings/automations");
  return result;
}
