"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOAuthClient } from "@/lib/google-oauth";
import { requireApprovedAgent, requirePermission } from "@/lib/require-permission";
import {
  INBOUND_CREATE_TICKETS_KEY,
  SENDER_NAME_KEY,
  readEmailAccountStatus,
  type EmailAccountStatus,
} from "@/lib/email-account";

/**
 * État de la boîte support, pour la barre latérale et /settings/email. Réservé
 * aux agents approuvés : l'adresse de la boîte connectée est une information
 * interne, et cette fonction est appelable en HTTP par n'importe qui sinon.
 * Les chemins serveur internes utilisent `readEmailAccountStatus`.
 */
export async function getEmailAccountStatus(): Promise<EmailAccountStatus> {
  await requireApprovedAgent();
  return readEmailAccountStatus();
}

export async function updateSenderName(name: string) {
  await requirePermission("settings.email");
  const senderName = z.string().trim().min(1).max(120).parse(name);

  await prisma.globalSetting.upsert({
    where: { key: SENDER_NAME_KEY },
    update: { value: senderName },
    create: {
      key: SENDER_NAME_KEY,
      value: senderName,
      label: "Nom de l'expéditeur",
      description: "Affiché comme nom d'expéditeur dans les emails envoyés aux clients.",
    },
  });
  revalidatePath("/settings/email");
}

/**
 * Active ou coupe la création de tickets depuis les emails entrants. Réservé aux
 * administrateurs : le réglage décide de ce qui entre dans la file de tous les
 * agents, et une boîte Gmail ordinaire reçoit aussi du courrier hors support.
 */
export async function updateInboundTicketCreation(enabled: boolean) {
  await requirePermission("settings.email");
  const value = z.boolean().parse(enabled) ? "1" : "0";

  await prisma.globalSetting.upsert({
    where: { key: INBOUND_CREATE_TICKETS_KEY },
    update: { value },
    create: {
      key: INBOUND_CREATE_TICKETS_KEY,
      value,
      label: "Créer des tickets depuis les emails entrants",
      description:
        "« 1 » : un email reçu sur la boîte support et rattaché à aucun ticket ouvre un nouveau ticket. « 0 » : il est ignoré.",
    },
  });
  revalidatePath("/settings/email");
  revalidatePath("/tickets");
}

export async function disconnectEmailAccount() {
  await requirePermission("settings.email");
  const account = await prisma.emailAccount.findFirst();
  if (!account) return;

  try {
    const client = createOAuthClient();
    await client.revokeToken(account.refreshToken);
  } catch {
    // Révocation best-effort : on supprime la connexion locale dans tous les cas.
  }

  await prisma.emailAccount.delete({ where: { id: account.id } });
  revalidatePath("/settings/email");
}
