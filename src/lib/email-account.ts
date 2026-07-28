import { prisma } from "@/lib/prisma";

export const SENDER_NAME_KEY = "email_sender_name";
export const DEFAULT_SENDER_NAME = "Ideeri Support";

export type EmailAccountStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  senderName: string;
};

/**
 * Lecture brute du compte support connecté, SANS contrôle d'accès.
 *
 * Réservée aux chemins serveur internes qui en ont besoin sans appelant humain
 * (accusé de réception d'un ticket déposé publiquement, automatisations, envoi
 * d'une réponse déjà autorisée en amont). La version exposée aux clients est
 * `getEmailAccountStatus` dans `@/lib/actions/email-account`, qui exige un
 * agent approuvé — l'adresse de la boîte support n'a pas à être lisible par un
 * anonyme.
 */
export async function readEmailAccountStatus(): Promise<EmailAccountStatus> {
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
