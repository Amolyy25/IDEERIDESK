"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";

export async function getEmailLayout() {
  await requireAdmin();
  return prisma.emailLayoutTemplate.findFirst();
}

const emailLayoutSchema = z.object({
  html: z.string().trim().min(1, "Le gabarit ne peut pas être vide.").max(40000),
});

export async function saveEmailLayout(input: z.infer<typeof emailLayoutSchema>) {
  await requireAdmin();
  const parsed = emailLayoutSchema.parse(input);
  // Profil « email » : styles inline et blocs <style> conservés, seul ce qui
  // pourrait s'exécuter est retiré. Les emplacements ({{content}}…) traversent
  // l'assainissement intacts, ce ne sont que des caractères de texte.
  const html = sanitizeEmailHtml(parsed.html);

  const existing = await prisma.emailLayoutTemplate.findFirst();
  if (existing) {
    await prisma.emailLayoutTemplate.update({ where: { id: existing.id }, data: { html } });
  } else {
    await prisma.emailLayoutTemplate.create({ data: { html } });
  }

  revalidatePath("/settings/email-layout");
  return html;
}

/** Retour au gabarit livré avec l'application : la ligne enregistrée disparaît. */
export async function resetEmailLayout() {
  await requireAdmin();
  await prisma.emailLayoutTemplate.deleteMany({});
  revalidatePath("/settings/email-layout");
}
