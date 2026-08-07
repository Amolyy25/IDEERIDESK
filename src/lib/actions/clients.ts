"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

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
  await requirePermission("clients.view");
  return prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tickets: true } } },
  });
}

export async function createClient(input: z.infer<typeof clientSchema>) {
  await requirePermission("clients.manage");
  const data = clientSchema.parse(input);

  const existing = await prisma.client.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error("Un client avec cet email existe déjà.");
  }

  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  return client;
}

export async function deleteClient(id: string) {
  await requirePermission("clients.delete");
  const ticketCount = await prisma.ticket.count({ where: { clientId: id } });
  if (ticketCount > 0) {
    // Refus maintenu ici, et renvoi vers l'écran qui sait quoi en faire : la
    // suppression d'un contact qui porte des tickets n'est pas un geste de tenue
    // du répertoire, c'est une réponse à un droit à l'effacement — elle laisse
    // des tickets sans demandeur et doit s'annoncer comme telle.
    throw new Error(
      "Ce client a des tickets associés. Pour répondre à une demande d'effacement, passez par Supervision → Données personnelles : l'anonymisation conserve le dossier support.",
    );
  }

  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
}
