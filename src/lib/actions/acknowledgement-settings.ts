"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";

export async function getAcknowledgementTemplate() {
  await requireAdmin();
  return prisma.ticketAcknowledgementTemplate.findFirst();
}

const acknowledgementTemplateSchema = z.object({
  bodyHtml: z.string().trim().max(20000),
});

export async function saveAcknowledgementTemplate(
  input: z.infer<typeof acknowledgementTemplateSchema>
) {
  await requireAdmin();
  const parsed = acknowledgementTemplateSchema.parse(input);
  // Inséré tel quel dans le gabarit d'email : profil « email », qui conserve
  // les styles inline nécessaires à la mise en forme.
  const data = { bodyHtml: sanitizeEmailHtml(parsed.bodyHtml) };

  const existing = await prisma.ticketAcknowledgementTemplate.findFirst();
  if (existing) {
    await prisma.ticketAcknowledgementTemplate.update({
      where: { id: existing.id },
      data: { bodyHtml: data.bodyHtml },
    });
  } else if (data.bodyHtml) {
    await prisma.ticketAcknowledgementTemplate.create({ data: { bodyHtml: data.bodyHtml } });
  }
  revalidatePath("/settings/acknowledgement");
}

export async function deleteAcknowledgementTemplate() {
  await requireAdmin();
  await prisma.ticketAcknowledgementTemplate.deleteMany({});
  revalidatePath("/settings/acknowledgement");
}
