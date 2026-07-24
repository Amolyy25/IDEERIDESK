"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";

export async function getPortalSettings() {
  const settings = await prisma.portalSettings.findFirst();
  return {
    introMessage: settings?.introMessage ?? null,
    faqEnabled: settings?.faqEnabled ?? true,
  };
}

const portalSettingsSchema = z.object({
  introMessage: z.string().trim().max(1000).optional().nullable(),
  faqEnabled: z.boolean(),
});

export async function savePortalSettings(input: z.infer<typeof portalSettingsSchema>) {
  await requireAdmin();
  const data = portalSettingsSchema.parse(input);

  const existing = await prisma.portalSettings.findFirst();
  if (existing) {
    await prisma.portalSettings.update({
      where: { id: existing.id },
      data: { introMessage: data.introMessage || null, faqEnabled: data.faqEnabled },
    });
  } else {
    await prisma.portalSettings.create({
      data: { introMessage: data.introMessage || null, faqEnabled: data.faqEnabled },
    });
  }
  revalidatePath("/settings/portal");
  revalidatePath("/");
}
