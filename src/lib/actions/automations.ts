"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { runAutomations } from "@/lib/automations";
import type { Prisma } from "@/generated/prisma/client";

const ruleInclude = { triggerStatus: true, actionStatus: true } satisfies Prisma.AutomationRuleInclude;

export type AutomationRuleWithStatuses = Prisma.AutomationRuleGetPayload<{
  include: typeof ruleInclude;
}>;

export async function getAutomationRules() {
  await requireAdmin();
  return prisma.automationRule.findMany({ include: ruleInclude, orderBy: { createdAt: "asc" } });
}

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  isActive: z.boolean(),
  delayDays: z.number().int().min(1).max(365),
  triggerStatusId: z.string().min(1),
  actionStatusId: z.string().min(1),
  addNote: z.boolean(),
  noteContent: z.string().trim().max(2000),
  sendEmail: z.boolean(),
  emailContent: z.string().trim().max(5000).optional().nullable(),
});

export async function createAutomationRule(input: z.infer<typeof ruleSchema>) {
  await requireAdmin();
  const data = ruleSchema.parse(input);
  await prisma.automationRule.create({ data: { ...data, emailContent: data.emailContent || null } });
  revalidatePath("/settings/automations");
}

export async function updateAutomationRule(id: string, input: z.infer<typeof ruleSchema>) {
  await requireAdmin();
  const data = ruleSchema.parse(input);
  await prisma.automationRule.update({
    where: { id },
    data: { ...data, emailContent: data.emailContent || null },
  });
  revalidatePath("/settings/automations");
}

export async function deleteAutomationRule(id: string) {
  await requireAdmin();
  await prisma.automationRule.delete({ where: { id } });
  revalidatePath("/settings/automations");
}

export async function runAutomationsNow() {
  await requireAdmin();
  const result = await runAutomations();
  revalidatePath("/settings/automations");
  return result;
}
