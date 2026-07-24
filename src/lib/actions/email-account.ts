"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOAuthClient } from "@/lib/google-oauth";

const SENDER_NAME_KEY = "email_sender_name";
const DEFAULT_SENDER_NAME = "Ideeri Support";

export async function getEmailAccountStatus() {
  const [account, senderNameSetting] = await Promise.all([
    prisma.emailAccount.findFirst(),
    prisma.globalSetting.findUnique({ where: { key: SENDER_NAME_KEY } }),
  ]);

  return {
    connected: Boolean(account),
    email: account?.email ?? null,
    connectedAt: account?.connectedAt ?? null,
    senderName: senderNameSetting?.value ?? DEFAULT_SENDER_NAME,
  };
}

export async function updateSenderName(name: string) {
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
