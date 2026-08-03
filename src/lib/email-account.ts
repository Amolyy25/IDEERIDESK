import { prisma } from "@/lib/prisma";

export const SENDER_NAME_KEY = "email_sender_name";
export const DEFAULT_SENDER_NAME = "Ideeri Support";

/**
 * Réglage « un email entrant sans ticket correspondant crée un ticket ».
 *
 * La boîte connectée est une boîte Gmail ordinaire : elle reçoit aussi du
 * courrier étranger au support. Le comportement est donc décidé par
 * l'administrateur, et désactivé tant que la ligne n'existe pas — un email
 * inconnu est alors simplement ignoré (comportement historique).
 */
export const INBOUND_CREATE_TICKETS_KEY = "email_inbound_create_tickets";

export type EmailAccountStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  senderName: string;
  /** Voir `INBOUND_CREATE_TICKETS_KEY`. */
  inboundCreatesTickets: boolean;
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
  const [account, senderNameSetting, inboundSetting] = await Promise.all([
    prisma.emailAccount.findFirst(),
    prisma.globalSetting.findUnique({ where: { key: SENDER_NAME_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: INBOUND_CREATE_TICKETS_KEY } }),
  ]);

  return {
    connected: Boolean(account),
    email: account?.email ?? null,
    connectedAt: account?.connectedAt ?? null,
    senderName: senderNameSetting?.value ?? DEFAULT_SENDER_NAME,
    inboundCreatesTickets: inboundSetting?.value === "1",
  };
}

/**
 * Lecture seule du réglage de création de tickets par email, pour la synchro
 * Gmail — qui tourne sans appelant humain et n'a pas besoin du reste du statut.
 */
export async function readInboundTicketCreationEnabled(): Promise<boolean> {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: INBOUND_CREATE_TICKETS_KEY },
  });
  return setting?.value === "1";
}
