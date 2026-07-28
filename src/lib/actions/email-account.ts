"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOAuthClient } from "@/lib/google-oauth";
import { requireAdmin, requireApprovedAgent } from "@/lib/require-permission";
import {
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
  await requireAdmin();
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

export async function disconnectEmailAccount() {
  await requireAdmin();
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
