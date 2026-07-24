"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  // Normalisé en minuscules : Client.email est la clé de dédup utilisée
  // partout ailleurs (widget, synchro Gmail) — sans ça, une même personne
  // saisie ici avec une casse différente se retrouve avec deux fiches.
  email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(30).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
});

export async function getClients() {
  return prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tickets: true } } },
  });
}

export async function createClient(input: z.infer<typeof clientSchema>) {
  const data = clientSchema.parse(input);

  const existing = await prisma.client.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error("Un client avec cet email existe déjà.");
  }

  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  return client;
}
