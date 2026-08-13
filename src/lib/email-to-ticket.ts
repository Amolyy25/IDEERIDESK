import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { EMAIL_METADATA_KEY, type InboundEmailMetadata } from "@/lib/inbound-email-metadata";
import { resolveTicketClient } from "@/lib/client-identity";
import { sendTicketAcknowledgement } from "@/lib/ticket-acknowledgement";
import { slaDueDatesForNewTicket } from "@/lib/sla-store";
import { notifyQueueOnNewTicket } from "@/lib/queue-notifications";
import { detectProductFromEmail } from "@/lib/product-detection";

/**
 * Création de ticket à partir d'un email entrant qui ne répond à aucun ticket
 * existant. Chemin activable depuis /settings/email : voir
 * `readInboundTicketCreationEnabled` dans `@/lib/email-account`.
 */

export class InboundTicketError extends Error {}

/** Objet vide : le ticket a quand même besoin d'un titre lisible en liste. */
const FALLBACK_SUBJECT = "(sans objet)";
/** Aligné sur la limite du formulaire public (`widgetTicketSchema.subject`). */
const MAX_SUBJECT_LENGTH = 200;
/**
 * Un email peut porter un corps démesuré (fil de discussion entier recopié,
 * export de logs collé). La colonne est du texte libre, mais la fiche ticket
 * affiche la demande d'origine en entier : au-delà, on coupe plutôt que de
 * rendre le ticket impossible à lire.
 */
const MAX_DESCRIPTION_LENGTH = 50_000;
const TRUNCATION_NOTICE = "\n\n[…] Message tronqué — voir l'email d'origine dans la boîte support.";

function truncate(value: string, max: number, notice = "…") {
  return value.length <= max ? value : `${value.slice(0, max)}${notice}`;
}

export type InboundEmailTicketInput = {
  /** Adresse de l'expéditeur, déjà normalisée en minuscules. */
  fromAddress: string;
  /** Nom affiché de l'en-tête `From`, s'il en portait un. */
  fromName: string | null;
  subject: string | null;
  /** Corps du mail en texte, non dépouillé de ses citations (voir `gmail-sync`). */
  body: string;
  /** En-têtes bruts de l'email, tels que lus par la synchro (absents = `undefined`). */
  headers: {
    to?: string;
    cc?: string;
    replyTo?: string;
    date?: string;
    messageId?: string;
  };
  gmailMessageId: string;
  gmailThreadId: string;
  attachments: {
    filename: string;
    mimeType: string;
    size: number;
    data: Uint8Array<ArrayBuffer>;
  }[];
};

export async function createTicketFromInboundEmail(input: InboundEmailTicketInput) {
  const [defaultStatus, defaultPriority] = await Promise.all([
    prisma.ticketStatus.findFirst({ where: { isDefault: true }, orderBy: { order: "asc" } }),
    prisma.ticketPriority.findFirst({ where: { isDefault: true }, orderBy: { order: "asc" } }),
  ]);

  // Levée plutôt qu'ignorée en silence : sans statut ni priorité par défaut,
  // *aucun* email entrant ne peut devenir un ticket, et la synchro doit le
  // signaler (compteur `failed` + log) au lieu de jeter le message.
  if (!defaultStatus || !defaultPriority) {
    throw new InboundTicketError(
      "Aucun statut ou priorité par défaut n'est configuré : impossible de créer le ticket."
    );
  }

  // Même règle que le formulaire public : la fiche client est la clé d'entrée
  // de tout l'historique, elle est créée à la volée si l'expéditeur est inconnu.
  // `trustName: false` : le nom déjà en base n'est jamais écrasé par le nom
  // affiché d'un client mail, souvent moins fiable (« jean », « Compta »).
  // La résolution passe par les alias, donc une adresse écartée par une fusion de
  // fiches retrouve le contact au lieu d'en recréer un — voir `resolveTicketClient`.
  const client = await resolveTicketClient({
    email: input.fromAddress,
    name: input.fromName,
    trustName: false,
  });

  // Tous les en-têtes utiles à un agent qui veut retrouver l'email d'origine :
  // qui a écrit, à quelle adresse, en copie de qui, quand, avec quel objet.
  // Les en-têtes absents ne sont pas écrits du tout, plutôt que stockés à
  // `null` : la fiche ticket n'affiche alors que les lignes réellement connues.
  const emailMetadata: InboundEmailMetadata = { from: input.fromAddress };

  if (input.fromName) emailMetadata.fromName = input.fromName;
  if (input.subject) emailMetadata.subject = input.subject;
  if (input.headers.to) emailMetadata.to = input.headers.to;
  if (input.headers.cc) emailMetadata.cc = input.headers.cc;
  if (input.headers.replyTo) emailMetadata.replyTo = input.headers.replyTo;
  if (input.headers.date) emailMetadata.date = input.headers.date;
  if (input.headers.messageId) emailMetadata.messageId = input.headers.messageId;
  emailMetadata.gmailThreadId = input.gmailThreadId;

  const rawSubject = input.subject?.trim();
  let subject = FALLBACK_SUBJECT;
  if (rawSubject) {
    subject = truncate(rawSubject, MAX_SUBJECT_LENGTH);
  }

  const rawBody = input.body.trim();
  let description = "(message vide)";
  if (rawBody) {
    description = truncate(rawBody, MAX_DESCRIPTION_LENGTH, TRUNCATION_NOTICE);
  }

  // Tri à l'arrivée : le produit est déduit de ce que le client a écrit, faute
  // d'une liste déroulante comme en ont le widget et le portail. Sur l'objet et
  // le corps tels qu'ils seront enregistrés, et non sur le brut : ce qui a été
  // coupé par la troncature n'est pas visible dans la fiche, il ne doit pas
  // décider du classement non plus. Rien de reconnu = pas de produit, comme
  // avant — voir `detectProductFromEmail`.
  const product = await detectProductFromEmail({ subject, body: description });

  const ticket = await prisma.ticket.create({
    data: {
      subject,
      description,
      source: "EMAIL",
      statusId: defaultStatus.id,
      priorityId: defaultPriority.id,
      categoryId: product?.id ?? null,
      clientId: client.id,
      // Horloge SLA : le délai court depuis l'arrivée de l'email.
      ...(await slaDueDatesForNewTicket(defaultPriority.id)),
      // `gmailMessageId` est unique : c'est lui qui empêche un même email de
      // créer deux tickets si la synchro relit la boîte (curseur d'historique
      // expiré, relance manuelle).
      gmailMessageId: input.gmailMessageId,
      gmailThreadId: input.gmailThreadId,
      // Dernier tour connu du fil : sert d'en-tête In-Reply-To à la réponse
      // sortante, pour que le client la reçoive dans sa conversation d'origine.
      emailMessageId: input.headers.messageId ?? null,
      // Personne n'a encore lu ce ticket : il doit ressortir comme une activité
      // non vue, exactement comme une réponse client reçue par email.
      hasUnreadActivity: true,
      metadata: { [EMAIL_METADATA_KEY]: emailMetadata } as Prisma.InputJsonValue,
      attachments: {
        create: input.attachments.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          data: file.data,
        })),
      },
    },
  });

  // Accusé de réception, comme pour un dépôt depuis un formulaire public : le
  // client reçoit le numéro de son ticket, dans le fil de son propre email (voir
  // `sendTicketAcknowledgementEmail`). Best-effort — `sendTicketAcknowledgement`
  // ne lève jamais : le ticket reste créé si aucun modèle n'est configuré ou si
  // l'envoi échoue, et le fil du ticket garde la trace de l'échec.
  //
  // Sans risque de boucle avec un répondeur automatique : sa réponse arrive dans
  // ce même fil Gmail, donc elle est rattachée au ticket comme un message de
  // plus, jamais transformée en nouveau ticket.
  await sendTicketAcknowledgement(ticket.id);

  // Prévient la file du produit reconnu plus haut. Quand rien n'a été reconnu,
  // le ticket n'a pas de produit et cet appel ne prévient personne : c'est la
  // règle de `notifyQueueOnNewTicket`, pas un oubli — le ticket reste à trier
  // dans l'onglet « Non assignés ».
  await notifyQueueOnNewTicket({ ticketId: ticket.id });

  return ticket;
}
