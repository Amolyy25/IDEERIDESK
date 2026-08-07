import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedGmailClient } from "@/lib/google-oauth";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE } from "@/lib/attachment-rules";
import { checkFileSignature } from "@/lib/file-signature";
import { scanForStorage, type ScanColumns } from "@/lib/upload-inspection";
import { reopenClosedTicket } from "@/lib/ticket-reopen";
import { resolveMergeRoot } from "@/lib/ticket-merge";
import { readInboundTicketCreationEnabled } from "@/lib/email-account";
import { createTicketFromInboundEmail } from "@/lib/email-to-ticket";

const TICKET_TAG_PATTERN = /\[#(\d+)\]/;

// Fenêtre rattrapée quand le curseur d'historique Gmail est périmé. Gmail ne
// conserve l'historique que quelques jours : au-delà, `history.list` échoue et
// seule une relecture de la boîte permet de récupérer ce qui est arrivé entre
// temps. Trois jours couvrent un week-end prolongé sans agent connecté.
const HISTORY_RECOVERY_WINDOW = "3d";
const HISTORY_RECOVERY_MAX_MESSAGES = 200;

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

// `.slice()` forces the concrete `Uint8Array<ArrayBuffer>` type Prisma's Bytes
// fields expect — a bare Buffer/Uint8Array is typed as backed by the wider
// `ArrayBufferLike`, which TS rejects for the Bytes column type.
function toBytesField(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer).slice();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Repère où commence le message précédent que le client répond, cité
// automatiquement par son client mail (Gmail, Outlook, Apple Mail…) — sans
// ça, chaque réponse traînerait tout l'historique déjà visible dans le fil
// du ticket, en double, à chaque tour.
//
// Le pattern FR/EN exige un vrai format de date (jour abrégé + date + heure)
// immédiatement après "Le"/"On" — pas juste "Le"/"On" suivi de n'importe quoi.
// Bug réel rencontré sans cette contrainte : un message client commençant par
// "Le problème est résolu." matchait lui-même comme début de citation (le
// moteur regex trouvait "a écrit :" de la VRAIE citation plus loin dans le
// texte et coupait depuis ce "Le" initial), vidant tout le message utile.
// `[\s\S]` (pas `.`) et pas d'ancre `$` de fin : les clients mail en texte
// brut wrappent les longues lignes d'en-tête ("...a" / "écrit :" finissent
// sur deux lignes séparées) — un `.{0,120}` qui ne traverse pas les sauts de
// ligne raterait exactement ce cas, pourtant le plus courant.
const QUOTE_HEADER_PATTERNS = [
  /^Le\s+\w{2,4}\.\s+\d{1,2}\s+\w+\.?\s+\d{4}\s+à\s+\d{1,2}[:h]\d{2}[\s\S]{0,100}?a\s+écrit\s?:/im, // Gmail/Apple Mail FR : "Le ven. 24 juil. 2026 à 15:36, X <y> a écrit :"
  /^On\s+\w{3},\s+\w+\s+\d{1,2},\s+\d{4}[\s\S]{0,100}?wrote\s?:/im, // Gmail/Apple Mail EN : "On Fri, Jul 24, 2026 at 3:36 PM X <y> wrote:"
  /^-{2,}\s?(Original Message|Message d'origine)\s?-{2,}/im, // Outlook
];

function stripQuotedReply(text: string): string {
  let cutIndex = text.length;

  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }

  // Coupe aussi à la première ligne citée en "> " (convention texte brut
  // universelle, indépendante de la langue du client mail).
  let offset = 0;
  for (const line of text.split("\n")) {
    if (/^\s*>/.test(line) && offset < cutIndex) {
      cutIndex = offset;
      break;
    }
    offset += line.length + 1;
  }

  return text.slice(0, cutIndex).trim();
}

type BodyParts = { text: string | null; html: string | null };

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): BodyParts {
  const result: BodyParts = { text: null, html: null };
  if (!part) return result;

  function walk(node: gmail_v1.Schema$MessagePart) {
    const isAttachment = Boolean(node.filename);
    if (!isAttachment && node.body?.data) {
      if (node.mimeType === "text/plain" && !result.text) {
        result.text = decodeBase64Url(node.body.data).toString("utf-8");
      } else if (node.mimeType === "text/html" && !result.html) {
        result.html = decodeBase64Url(node.body.data).toString("utf-8");
      }
    }
    node.parts?.forEach(walk);
  }

  walk(part);
  return result;
}

type AttachmentPart = { filename: string; mimeType: string; attachmentId?: string; data?: string };

function extractAttachmentParts(part: gmail_v1.Schema$MessagePart | undefined): AttachmentPart[] {
  const results: AttachmentPart[] = [];
  if (!part) return results;

  function walk(node: gmail_v1.Schema$MessagePart) {
    if (node.filename && node.body) {
      results.push({
        filename: node.filename,
        mimeType: node.mimeType ?? "application/octet-stream",
        attachmentId: node.body.attachmentId ?? undefined,
        data: node.body.data ?? undefined,
      });
    }
    node.parts?.forEach(walk);
  }

  walk(part);
  return results;
}

/** Adresse seule d'un en-tête `From` (« Nom <a@b.c> » comme « a@b.c »), en minuscules. */
function parseFromAddress(from: string | undefined) {
  if (!from) return null;
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).trim().toLowerCase() || null;
}

/**
 * Nom affiché d'un en-tête `From` (« Nom <a@b.c> » → « Nom »), ou `null` quand
 * l'en-tête ne contient que l'adresse. Les guillemets qui entourent les noms
 * contenant une virgule (« "Dupont, Jean" <…> ») sont retirés.
 */
function parseFromName(from: string | undefined) {
  if (!from) return null;
  const match = from.match(/^\s*(.*?)\s*<[^>]+>\s*$/);
  const name = match?.[1]?.replace(/^"(.*)"$/, "$1").trim();
  return name || null;
}

/**
 * Courrier qu'aucun humain n'attend une réponse : réponse automatique
 * (« absent du bureau »), notification de service, newsletter, liste de
 * diffusion. Filtré même quand la création de tickets est activée : ces mails
 * arrivent en masse sur une boîte ordinaire et rempliraient la file d'attente
 * de tickets que personne ne peut traiter. Une réponse automatique déclenchée
 * par un de nos propres envois créerait en plus un aller-retour sans fin.
 */
function isUnattendedEmail(headers: gmail_v1.Schema$MessagePartHeader[] | undefined) {
  const autoSubmitted = getHeader(headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;

  const precedence = getHeader(headers, "Precedence")?.toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return true;

  return Boolean(
    getHeader(headers, "List-Id") ||
      getHeader(headers, "List-Unsubscribe") ||
      getHeader(headers, "X-Autoreply") ||
      getHeader(headers, "X-Autorespond")
  );
}

async function resolveTicket(subject: string | undefined, gmailThreadId: string) {
  const byThread = await prisma.ticket.findFirst({ where: { gmailThreadId } });
  if (byThread) return byThread;

  const tagMatch = subject?.match(TICKET_TAG_PATTERN);
  if (tagMatch) {
    const byNumber = await prisma.ticket.findUnique({ where: { number: Number(tagMatch[1]) } });
    if (byNumber) return byNumber;
  }

  return null;
}

async function downloadAttachments(
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
  parts: AttachmentPart[]
) {
  const attachments: ({
    filename: string;
    mimeType: string;
    size: number;
    data: Uint8Array<ArrayBuffer>;
  } & ScanColumns)[] = [];

  for (const part of parts) {
    let buffer: Buffer;
    if (part.data) {
      buffer = decodeBase64Url(part.data);
    } else if (part.attachmentId) {
      const { data } = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: gmailMessageId,
        id: part.attachmentId,
      });
      if (!data.data) continue;
      buffer = decodeBase64Url(data.data);
    } else {
      continue;
    }
    // Seul chemin d'écriture de pièces jointes alimenté par des tiers non
    // authentifiés (n'importe qui peut répondre à un ticket par email). Sans ce
    // filtre, un `text/html` ou un SVG entrant est stocké tel quel puis resservi
    // par /api/attachments/[id] : script exécuté en même origine que
    // l'application, avec la session de l'agent qui l'ouvre.
    if (!ALLOWED_ATTACHMENT_TYPES.includes(part.mimeType)) continue;
    if (buffer.byteLength > MAX_ATTACHMENT_SIZE) continue;

    const bytes = toBytesField(buffer);

    // Le contenu doit être l'image que l'en-tête MIME annonce. Contrairement
    // aux téléversements, la liste blanche ci-dessus porte sur le `Content-Type`
    // de la partie MIME, choisi par l'expéditeur : c'est la signature qui
    // tranche réellement.
    if (!checkFileSignature(bytes, part.mimeType).ok) continue;

    // Google analyse déjà les pièces jointes de la boîte support, donc ce scan
    // est une seconde barrière et non la première. Il est conservé parce qu'il
    // ne coûte rien ici et qu'il couvre ce que le filtre amont laisse passer :
    // une charge trop récente pour être connue de Google au moment de la
    // réception, et le jour où la boîte entrante ne sera plus Gmail.
    const scan = await scanForStorage(bytes, "email-entrant");
    if (!scan) continue;

    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      size: buffer.byteLength,
      data: bytes,
      ...scan,
    });
  }

  return attachments;
}

type InboundOptions = {
  /** Voir `INBOUND_CREATE_TICKETS_KEY` : réglage administrable de /settings/email. */
  createTickets: boolean;
  /** Adresse de la boîte connectée, pour ne pas traiter nos propres envois. */
  mailboxEmail: string;
};

async function processInboundMessage(
  gmail: gmail_v1.Gmail,
  gmailMessageId: string,
  options: InboundOptions
) {
  // Deux emplacements possibles pour un email déjà traité : une réponse est
  // enregistrée comme `Message`, un email qui a ouvert un ticket est marqué sur
  // le `Ticket` lui-même. Sans la seconde vérification, une relecture de la
  // boîte (curseur d'historique expiré) rattacherait le mail d'origine à son
  // propre ticket, en double, comme si le client avait répondu.
  const [processedMessage, processedTicket] = await Promise.all([
    prisma.message.findUnique({ where: { gmailMessageId }, select: { id: true } }),
    prisma.ticket.findUnique({ where: { gmailMessageId }, select: { id: true } }),
  ]);
  if (processedMessage || processedTicket) return { skipped: true as const };

  const { data: message } = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  });

  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const gmailThreadId = message.threadId ?? gmailMessageId;

  const existingTicket = await resolveTicket(subject, gmailThreadId);

  // La boîte connectée est une boîte Gmail normale, pas une adresse dédiée
  // exclusivement au support — elle reçoit aussi des emails sans rapport avec un
  // ticket. Ce qu'il advient d'un email rattaché à aucun ticket dépend donc du
  // réglage : ouverture d'un nouveau ticket, ou email ignoré (défaut).
  if (!existingTicket) {
    const fromHeader = getHeader(headers, "From");
    const fromAddress = parseFromAddress(fromHeader);

    if (options.createTickets && fromAddress) {
      // Un mail dont l'expéditeur est la boîte elle-même est un de nos propres
      // envois (un message envoyé à soi-même porte aussi le libellé INBOX) :
      // en faire un ticket, c'est répondre à soi-même en boucle.
      if (fromAddress === options.mailboxEmail) {
        return { skipped: false as const, action: "ignored" as const };
      }
      if (isUnattendedEmail(headers)) {
        console.warn(
          `[gmail-sync] email automatique ou de liste de diffusion, aucun ticket créé : ` +
            `message Gmail ${gmailMessageId}.`
        );
        return { skipped: false as const, action: "ignored" as const };
      }

      const body = extractBody(message.payload);
      // Corps conservé entier, citations comprises — contrairement à une
      // réponse dans un fil existant : la demande initiale est souvent un
      // transfert (« Fwd: »), dont tout l'intérêt est justement le mail cité.
      const rawContent = body.text?.trim() || (body.html ? stripHtml(body.html) : "") || "";
      const attachments = await downloadAttachments(
        gmail,
        gmailMessageId,
        extractAttachmentParts(message.payload)
      );

      const ticket = await createTicketFromInboundEmail({
        fromAddress,
        fromName: parseFromName(fromHeader),
        subject: subject ?? null,
        body: rawContent,
        headers: {
          to: getHeader(headers, "To"),
          cc: getHeader(headers, "Cc"),
          replyTo: getHeader(headers, "Reply-To"),
          date: getHeader(headers, "Date"),
          messageId: messageIdHeader,
        },
        gmailMessageId,
        gmailThreadId,
        attachments,
      });

      return { skipped: false as const, action: "created" as const, ticketId: ticket.id };
    }

    // Création désactivée : un email d'un expéditeur inconnu est du courrier
    // ordinaire, sans intérêt. Mais un email venant d'un client déjà en base et
    // qui ne se rattache à aucun ticket est presque toujours une relance dont le
    // client a cassé le fil (sujet réécrit, nouveau message au lieu d'une
    // réponse) : elle était jetée sans laisser la moindre trace. On journalise
    // l'identifiant interne du client, jamais son adresse — les logs de la
    // plateforme n'ont pas à contenir de données personnelles.
    if (fromAddress) {
      const knownClient = await prisma.client.findUnique({
        where: { email: fromAddress },
        select: { id: true },
      });
      if (knownClient) {
        console.warn(
          `[gmail-sync] email d'un client connu (client ${knownClient.id}) rattaché à aucun ` +
            `ticket, ignoré : message Gmail ${gmailMessageId}, fil ${gmailThreadId}.`
        );
        return { skipped: false as const, action: "orphaned" as const };
      }
    }
    return { skipped: false as const, action: "ignored" as const };
  }

  const body = extractBody(message.payload);
  const rawContent = body.text?.trim() || (body.html ? stripHtml(body.html) : "") || "";
  const content = stripQuotedReply(rawContent) || "(message vide)";
  const attachmentParts = extractAttachmentParts(message.payload);

  const created = await prisma.message.create({
    data: {
      ticketId: existingTicket.id,
      content,
      authorType: "CLIENT",
      isPrivate: false,
      gmailMessageId,
    },
  });
  await prisma.ticket.update({
    where: { id: existingTicket.id },
    data: {
      gmailThreadId,
      emailMessageId: messageIdHeader ?? existingTicket.emailMessageId,
      // Un ticket fusionné n'est plus un dossier de travail : le signaler comme
      // « à voir » le ferait ressortir dans les vues alors que l'équipe traite
      // la demande ailleurs. C'est la cible, juste en dessous, qui s'allume.
      hasUnreadActivity: existingTicket.mergedIntoId === null,
      updatedAt: new Date(),
    },
  });

  const attachments = await downloadAttachments(gmail, gmailMessageId, attachmentParts);
  if (attachments.length > 0) {
    // `messageId` en plus du ticket : dans un fil de plusieurs tours, une pièce
    // jointe rattachée au seul ticket ne dit pas de quelle réponse elle vient.
    await prisma.attachment.createMany({
      data: attachments.map((a) => ({ ...a, ticketId: existingTicket.id, messageId: created.id })),
    });
  }

  // Ticket fusionné : le message reste dans le fil de SON client (c'est sa
  // conversation, et c'est par elle qu'on lui répondra), mais l'alerte part vers
  // le ticket où l'équipe travaille. Sans ce renvoi, une relance sur un doublon
  // n'était visible nulle part. Et surtout : pas de réouverture, qui remettrait
  // en file un dossier volontairement rattaché.
  let reopened = false;
  if (existingTicket.mergedIntoId) {
    const rootId = await resolveMergeRoot(existingTicket.mergedIntoId);
    await prisma.ticket.update({
      where: { id: rootId },
      data: { hasUnreadActivity: true, updatedAt: new Date() },
    });
    await reopenClosedTicket(rootId);
  } else {
    // Après l'enregistrement du message, pour que la note système de réouverture
    // se place bien après la réponse du client dans le fil.
    reopened = await reopenClosedTicket(existingTicket.id);
  }

  return {
    skipped: false as const,
    action: "appended" as const,
    ticketId: existingTicket.id,
    messageId: created.id,
    reopened,
  };
}

/**
 * Identifiants des messages récents de la boîte de réception, utilisés quand le
 * curseur d'historique n'est plus exploitable. Le dédoublonnage par
 * `Message.gmailMessageId` rend cette relecture sans effet de bord : un message
 * déjà enregistré est simplement sauté.
 */
async function listRecentInboxMessageIds(gmail: gmail_v1.Gmail) {
  const { data } = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox newer_than:${HISTORY_RECOVERY_WINDOW}`,
    maxResults: HISTORY_RECOVERY_MAX_MESSAGES,
  });
  return (data.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));
}

/** `history.list` refuse un `startHistoryId` sorti de la fenêtre de rétention Gmail. */
function isExpiredHistoryCursor(error: unknown) {
  const code = (error as { code?: number | string }).code;
  return code === 404 || code === "404" || code === 400 || code === "400";
}

export async function syncGmailInbox() {
  const authenticated = await getAuthenticatedGmailClient();
  if (!authenticated) {
    return {
      connected: false as const,
      appended: 0,
      created: 0,
      reopened: 0,
      ignored: 0,
      orphaned: 0,
      skipped: 0,
      failed: 0,
      recovered: false,
    };
  }
  const { gmail, account } = authenticated;
  const createTickets = await readInboundTicketCreationEnabled();
  const inboundOptions = {
    createTickets,
    mailboxEmail: account.email.trim().toLowerCase(),
  };

  let messageIds: string[] = [];
  let newHistoryId = account.historyId;
  let recovered = false;

  if (account.historyId) {
    try {
      const { data } = await gmail.users.history.list({
        userId: "me",
        startHistoryId: account.historyId,
        historyTypes: ["messageAdded"],
      });
      const seen = new Set<string>();
      for (const record of data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          // Only messages that actually landed in the inbox — history also
          // reports our own outbound sends (labeled SENT), which must not be
          // re-processed as if the client had written in.
          const labels = added.message?.labelIds ?? [];
          if (added.message?.id && labels.includes("INBOX")) {
            seen.add(added.message.id);
          }
        }
      }
      messageIds = Array.from(seen);
      newHistoryId = data.historyId ?? account.historyId;
    } catch (error) {
      // Gmail purge l'historique au bout de quelques jours. Sans ce repli, une
      // pause de synchro plus longue que la rétention (week-end sans agent
      // connecté, cron arrêté) faisait échouer *tous* les syncs suivants, en
      // boucle, et chaque réponse client reçue entre temps était perdue sans
      // aucun moyen de la récupérer.
      if (!isExpiredHistoryCursor(error)) throw error;

      messageIds = await listRecentInboxMessageIds(gmail);
      const { data: profile } = await gmail.users.getProfile({ userId: "me" });
      // Curseur réarmé seulement après un rattrapage réussi : le remettre à
      // jour sur un échec sauterait définitivement la période concernée.
      newHistoryId = profile.historyId ?? null;
      recovered = true;
      console.warn(
        `[gmail-sync] curseur d'historique expiré : relecture des ${HISTORY_RECOVERY_WINDOW} ` +
          `derniers jours (${messageIds.length} message(s) à examiner), puis reprise du suivi incrémental.`
      );
    }
  } else {
    // Premier sync : pas d'historique connu, on amorce le curseur sans
    // traiter le backlog complet (on récupère juste le point de départ).
    const { data: profile } = await gmail.users.getProfile({ userId: "me" });
    newHistoryId = profile.historyId ?? null;
  }

  let appended = 0;
  let created = 0;
  let reopened = 0;
  let ignored = 0;
  let orphaned = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of messageIds) {
    try {
      const result = await processInboundMessage(gmail, id, inboundOptions);

      if (result.skipped) {
        skipped++;
      } else if (result.action === "ignored") {
        ignored++;
      } else if (result.action === "orphaned") {
        orphaned++;
      } else if (result.action === "created") {
        created++;
      } else {
        appended++;
        if (result.reopened) reopened++;
      }
    } catch (error) {
      // Distinct de `skipped` (déjà traité, cas normal) : ici le message n'a
      // jamais été enregistré et sera retenté au prochain sync tant que
      // l'erreur persiste — sans ce log, un email malformé qui plante en
      // boucle est invisible (le compteur ne dit pas lequel ni pourquoi).
      failed++;
      // Message d'erreur seul, jamais l'objet complet : il contient des
      // extraits d'email, donc des données personnelles de clients finaux, qui
      // n'ont pas à se retrouver dans les logs de la plateforme.
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      console.error(`[gmail-sync] échec du traitement du message ${id} : ${reason}`);
    }
  }

  if (newHistoryId && newHistoryId !== account.historyId) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { historyId: newHistoryId },
    });
  }

  return {
    connected: true as const,
    appended,
    created,
    reopened,
    ignored,
    orphaned,
    skipped,
    failed,
    recovered,
  };
}
