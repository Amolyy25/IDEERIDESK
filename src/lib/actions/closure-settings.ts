"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";

export async function getClosureTemplate() {
  await requireAdmin();
  return prisma.ticketClosureTemplate.findFirst();
}

const closureTemplateSchema = z.object({
  bodyHtml: z.string().trim().max(20000),
});

export async function saveClosureTemplate(input: z.infer<typeof closureTemplateSchema>) {
  await requireAdmin();
  const parsed = closureTemplateSchema.parse(input);
  // Inséré tel quel dans le gabarit d'email (email-template.ts). Profil
  // « email » : les styles inline sont conservés, un email en a besoin ; seul
  // ce qui pourrait s'exécuter est retiré.
  const data = { bodyHtml: sanitizeEmailHtml(parsed.bodyHtml) };

  const existing = await prisma.ticketClosureTemplate.findFirst();
  if (existing) {
    await prisma.ticketClosureTemplate.update({
      where: { id: existing.id },
      data: { bodyHtml: data.bodyHtml },
    });
  } else if (data.bodyHtml) {
    await prisma.ticketClosureTemplate.create({ data: { bodyHtml: data.bodyHtml } });
  }
  revalidatePath("/settings/closure");
}

export async function deleteClosureTemplate() {
  await requireAdmin();
  await prisma.ticketClosureTemplate.deleteMany({});
  revalidatePath("/settings/closure");
}
