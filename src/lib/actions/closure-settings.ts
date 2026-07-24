"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-permission";

export async function getClosureTemplate() {
  return prisma.ticketClosureTemplate.findFirst();
}

const closureTemplateSchema = z.object({
  bodyHtml: z.string().trim().max(20000),
});

export async function saveClosureTemplate(input: z.infer<typeof closureTemplateSchema>) {
  await requireAdmin();
  const data = closureTemplateSchema.parse(input);

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
