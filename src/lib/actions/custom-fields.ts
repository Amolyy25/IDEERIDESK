"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

const customFieldSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(60),
  type: z.enum(["TEXT", "TEXTAREA", "DROPDOWN", "CHECKBOX"]),
  options: z.array(z.string().trim().min(1)).optional(),
  helpText: z.string().trim().max(300).optional().nullable(),
  autofillFromSourceUrl: z.boolean().default(false),
  isRequired: z.boolean(),
  isActive: z.boolean(),
});

function slugifyKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Lecture volontairement ouverte : ces valeurs alimentent les listes déroulantes
// des formulaires publics (/widget, /nouveau-ticket), donc elles sont par nature
// visibles de leurs visiteurs. Toutes les écritures ci-dessous exigent en
// revanche un agent habilité.
export async function getCustomFields() {
  return prisma.customField.findMany({ orderBy: { order: "asc" } });
}

export async function createCustomField(input: z.infer<typeof customFieldSchema>) {
  await requirePermission("settings.tickets");
  const data = customFieldSchema.parse(input);
  const key = slugifyKey(data.label);

  if (!key) {
    throw new Error("Libellé invalide : impossible d'en dériver un identifiant.");
  }

  const existing = await prisma.customField.findUnique({ where: { key } });
  if (existing) {
    throw new Error("Un champ personnalisé avec un libellé équivalent existe déjà.");
  }

  const count = await prisma.customField.count();

  await prisma.customField.create({
    data: {
      label: data.label,
      key,
      type: data.type,
      options: data.type === "DROPDOWN" ? data.options ?? [] : undefined,
      helpText: data.helpText || null,
      autofillFromSourceUrl: data.type === "TEXT" ? data.autofillFromSourceUrl : false,
      isRequired: data.isRequired,
      isActive: data.isActive,
      order: count,
    },
  });
  revalidatePath("/settings/custom-fields");
}

export async function updateCustomField(id: string, input: z.infer<typeof customFieldSchema>) {
  await requirePermission("settings.tickets");
  const data = customFieldSchema.parse(input);

  await prisma.customField.update({
    where: { id },
    data: {
      label: data.label,
      type: data.type,
      options: data.type === "DROPDOWN" ? data.options ?? [] : undefined,
      helpText: data.helpText || null,
      autofillFromSourceUrl: data.type === "TEXT" ? data.autofillFromSourceUrl : false,
      isRequired: data.isRequired,
      isActive: data.isActive,
    },
  });
  revalidatePath("/settings/custom-fields");
}

export async function deleteCustomField(id: string) {
  await requirePermission("settings.tickets");
  await prisma.customField.delete({ where: { id } });
  revalidatePath("/settings/custom-fields");
}
