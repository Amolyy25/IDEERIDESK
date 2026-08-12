"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { recordAudit } from "@/lib/audit";
import {
  ClientMergeError,
  describeClientMerge,
  describeClientUnmerge,
  findReclaimableTickets,
  mergeClients,
  unmergeClient,
  type ClientMergeOutcome,
  type ClientUnmergeOutcome,
  type ReclaimableSearch,
} from "@/lib/client-merge";
import { MAX_CLIENTS_PER_MERGE } from "@/lib/client-merge-fields";

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
    include: {
      // Le rattachement de fusion, dans les deux sens : la fiche absorbée dit à
      // quel contact elle renvoie, le contact actif dit combien de fiches il
      // rassemble. Les deux se voient dans le répertoire — sinon un email venu
      // d'une adresse absorbée semblerait atterrir n'importe où.
      mergedInto: { select: { id: true, name: true, email: true } },
      _count: { select: { tickets: true, mergedClients: true } },
    },
  });
}

export async function createClient(input: z.infer<typeof clientSchema>) {
  await requirePermission("clients.manage");
  const data = clientSchema.parse(input);

  const existing = await prisma.client.findUnique({
    where: { email: data.email },
    select: { mergedInto: { select: { name: true } } },
  });
  if (existing) {
    // La fiche trouvée peut être une fiche ABSORBÉE : elle n'apparaît plus comme
    // un contact à part entière, et « un client avec cet email existe déjà »
    // enverrait alors chercher une ligne introuvable dans le répertoire.
    throw new Error(
      existing.mergedInto
        ? `Cette adresse appartient à une fiche rattachée au contact « ${existing.mergedInto.name} ». Ouvrez ce contact plutôt que d'en créer un second.`
        : "Un client avec cet email existe déjà.",
    );
  }

  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  return client;
}

const reclaimSearchSchema = z.object({
  emails: z.array(z.string().trim().max(320)).min(1).max(MAX_CLIENTS_PER_MERGE),
  mergedClientIds: z.array(z.string().min(1)).max(MAX_CLIENTS_PER_MERGE),
});

/**
 * Cherche les tickets venus d'une des adresses en jeu mais rattachés ailleurs.
 *
 * Déclenchée par un bouton de la fenêtre de fusion. La garde est celle de la
 * fusion et non de la lecture : la réponse rapproche un sujet de ticket d'une
 * adresse email, ce qui en fait un croisement de données personnelles, et elle ne
 * sert qu'à préparer un déplacement.
 */
export async function findTicketsFromMergedAddresses(
  input: z.input<typeof reclaimSearchSchema>,
): Promise<ReclaimableSearch> {
  await requirePermission("clients.merge");
  const data = reclaimSearchSchema.parse(input);
  return findReclaimableTickets(data);
}

const mergeClientsSchema = z.object({
  /**
   * Fiche qui reste le contact actif. C'est SON adresse que le contact garde —
   * l'adresse ne se déplace pas d'une fiche à l'autre, voir `MERGEABLE_FIELDS`.
   */
  survivorId: z.string().min(1),
  absorbedIds: z
    .array(z.string().min(1))
    .min(1, "Une fusion demande au moins deux fiches.")
    .max(
      MAX_CLIENTS_PER_MERGE - 1,
      `Pas plus de ${MAX_CLIENTS_PER_MERGE} fiches à la fois : au-delà, relisez-les en deux fusions.`,
    ),
  // Mêmes bornes que `clientSchema` : la fusion écrit dans les mêmes colonnes,
  // elle ne peut pas y laisser passer ce qu'une création refuse. Que ces valeurs
  // viennent bien des fiches fusionnées est vérifié à part, côté moteur
  // (`refuseInventedValues`).
  keep: z.object({
    name: z.string().trim().min(1, "Nom requis").max(120),
    phone: z
      .string()
      .trim()
      .max(30)
      .nullish()
      .transform((v) => v || null),
    company: z
      .string()
      .trim()
      .max(120)
      .nullish()
      .transform((v) => v || null),
  }),
  /**
   * Tickets cochés à la main dans la fenêtre parmi ceux venus de ces adresses.
   * Le moteur revérifie chacun (origine, propriétaire actuel) : cette liste vient
   * du navigateur, elle ne prouve rien à elle seule.
   */
  claimTicketIds: z.array(z.string().min(1)).max(50).optional(),
});

/**
 * Réunit plusieurs fiches contacts en une seule.
 *
 * Le geste lui-même est dans `@/lib/client-merge` ; ici, la garde, la validation
 * de l'entrée et la trace. Les refus du moteur sont des phrases écrites pour
 * l'agent (« cette fiche n'existe plus », « identité effacée ») : elles remontent
 * telles quelles au lieu d'être aplaties en erreur générique.
 */
export async function mergeClientRecords(
  input: z.input<typeof mergeClientsSchema>,
): Promise<ClientMergeOutcome> {
  const session = await requirePermission("clients.merge");
  const data = mergeClientsSchema.parse(input);

  try {
    const outcome = await mergeClients({
      ...data,
      actorName: session.user.name || session.user.email || "un agent",
    });

    // Relu après coup et non pris de l'entrée : l'adresse du contact conservé est
    // celle de SA fiche, le navigateur ne la fournit pas.
    const survivor = await prisma.client.findUnique({
      where: { id: outcome.survivorId },
      select: { email: true },
    });

    await recordAudit({
      session,
      action: "CLIENTS_MERGED",
      summary: describeClientMerge(outcome, survivor?.email ?? "adresse inconnue"),
    });

    revalidatePath("/clients");
    // Les tickets déplacés changent de demandeur affiché, et la recherche par
    // email de la file ne les trouve plus sous l'ancienne adresse.
    revalidatePath("/tickets");
    revalidatePath("/privacy");
    return outcome;
  } catch (error) {
    if (error instanceof ClientMergeError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

/**
 * Détache une fiche du contact qui l'avait absorbée.
 *
 * Même permission que la fusion : c'est le même geste, dans l'autre sens, et il
 * déplace les mêmes dossiers. Rien ne justifierait qu'un agent puisse fusionner
 * sans pouvoir réparer sa fusion.
 */
export async function separateMergedClient(clientId: string): Promise<ClientUnmergeOutcome> {
  const session = await requirePermission("clients.merge");
  const id = z.string().min(1).parse(clientId);

  try {
    const outcome = await unmergeClient({
      clientId: id,
      actorName: session.user.name || session.user.email || "un agent",
    });

    await recordAudit({
      session,
      action: "CLIENTS_UNMERGED",
      summary: describeClientUnmerge(outcome),
    });

    revalidatePath("/clients");
    revalidatePath("/tickets");
    revalidatePath("/privacy");
    return outcome;
  } catch (error) {
    if (error instanceof ClientMergeError) {
      throw new Error(error.message);
    }
    throw error;
  }
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
