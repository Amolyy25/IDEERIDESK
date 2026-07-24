"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(120),
  email: z.string().trim().email("Email invalide"),
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
  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  return client;
}
