import { AUDIT_CSV_HEADERS, CSV_BOM, csvRow } from "@/lib/audit-csv";
import type { SubjectDossier } from "@/lib/privacy-dossier";

/**
 * Mise en forme CSV du dossier d'une personne concernée.
 *
 * Mêmes conventions que l'export du journal (point-virgule, BOM UTF-8, dates ISO
 * doublées d'une date lisible) : c'est le même tableur qui ouvrira les deux, et
 * une équipe n'a pas à apprendre deux formats.
 *
 * Un CSV ne sait pas décrire une hiérarchie, alors qu'un dossier en est une
 * (l'identité, puis des tickets, puis les messages de ces tickets). Le fichier
 * est donc découpé en BLOCS successifs, chacun précédé de son titre et de sa
 * propre ligne d'en-têtes, séparés par une ligne vide. Un tableur ouvre ça comme
 * une feuille unique où chaque section se lit et se trie séparément — la seule
 * façon d'obtenir un fichier à la fois complet et ouvrable d'un double-clic.
 *
 * Le premier bloc dit QUI a produit le fichier et QUAND. Un dossier remis à une
 * personne concernée est une pièce : sans cette en-tête, on ne peut ni le dater
 * ni savoir qui l'a extrait.
 */

const TICKET_HEADERS = [
  "Ticket",
  "Sujet",
  "Statut",
  "Priorité",
  "Produit concerné",
  "Origine",
  "Assigné à",
  "Demandeur",
  "Créé le",
  "Clos le",
  "Champs personnalisés renseignés",
  "Description",
] as const;

const MESSAGE_HEADERS = [
  "Ticket",
  "Horodatage (ISO 8601)",
  "Quand (lisible)",
  "Auteur",
  "Type d'auteur",
  "Visibilité",
  "Envoyé par email",
  "Contenu",
] as const;

const ATTACHMENT_HEADERS = [
  "Ticket",
  "Nom du fichier",
  "Type",
  "Taille (octets)",
  "Ajoutée le",
] as const;

const NOTIFICATION_HEADERS = [
  "Horodatage (ISO 8601)",
  "Quand (lisible)",
  "Nature",
  "Ticket",
  "Extrait",
  "Lue le",
] as const;

const readableDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

function readable(value: Date | null): string {
  return value ? readableDate.format(value) : "";
}

function iso(value: Date | null): string {
  return value ? value.toISOString() : "";
}

/** Titre de bloc sur sa propre ligne, précédé d'une ligne vide qui l'isole. */
function blockTitle(title: string): string {
  return "\r\n" + csvRow([title]);
}

/** Bloc vide : on écrit « aucune donnée » plutôt que de sauter la section. */
function emptyBlock(message: string): string {
  return csvRow([message]);
}

function identityBlock(dossier: SubjectDossier): string {
  let out = blockTitle("IDENTITÉ") + csvRow(["Champ", "Valeur"]);
  for (const field of dossier.identity) {
    const value =
      field.value instanceof Date
        ? `${readable(field.value)} (${iso(field.value)})`
        : (field.value ?? "");
    out += csvRow([field.label, value]);
  }
  return out;
}

function ticketsBlock(dossier: SubjectDossier): string {
  const label =
    dossier.kind === "CLIENT"
      ? "TICKETS OUVERTS PAR CETTE PERSONNE"
      : "TICKETS ACTUELLEMENT ASSIGNÉS À CETTE PERSONNE";

  let out = blockTitle(label);
  if (dossier.tickets.length === 0) return out + emptyBlock("Aucun ticket.");

  out += csvRow([...TICKET_HEADERS]);
  for (const ticket of dossier.tickets) {
    out += csvRow([
      `#${ticket.number}`,
      ticket.subject,
      ticket.status,
      ticket.priority,
      ticket.category ?? "",
      ticket.source,
      ticket.assignee ?? "Non assigné",
      ticket.client ?? "",
      readable(ticket.createdAt),
      readable(ticket.closedAt),
      ticket.customFields,
      ticket.description,
    ]);
  }
  return out;
}

function messagesBlock(dossier: SubjectDossier): string {
  const label =
    dossier.kind === "CLIENT"
      ? "CONVERSATIONS (MESSAGES DE SES TICKETS)"
      : "MESSAGES ÉCRITS PAR CETTE PERSONNE";

  let out = blockTitle(label);
  if (dossier.messages.length === 0) return out + emptyBlock("Aucun message.");

  out += csvRow([...MESSAGE_HEADERS]);
  for (const message of dossier.messages) {
    out += csvRow([
      `#${message.ticketNumber}`,
      iso(message.createdAt),
      readable(message.createdAt),
      message.author,
      message.authorType,
      message.visibility,
      message.emailSent ? "oui" : "non",
      message.content,
    ]);
  }
  return out;
}

function attachmentsBlock(dossier: SubjectDossier): string {
  // Le bloc n'existe pas pour un agent : les fichiers d'un ticket sont la donnée
  // du client qui les a déposés.
  if (dossier.kind === "AGENT") return "";

  let out = blockTitle("PIÈCES JOINTES (DESCRIPTION SEULE)");
  if (dossier.attachments.length === 0) return out + emptyBlock("Aucune pièce jointe.");

  out += csvRow([...ATTACHMENT_HEADERS]);
  for (const attachment of dossier.attachments) {
    out += csvRow([
      `#${attachment.ticketNumber}`,
      attachment.filename,
      attachment.mimeType,
      attachment.size,
      readable(attachment.createdAt),
    ]);
  }
  return out;
}

function notificationsBlock(dossier: SubjectDossier): string {
  if (dossier.kind === "CLIENT") return "";

  let out = blockTitle("NOTIFICATIONS REÇUES");
  if (dossier.notifications.length === 0) return out + emptyBlock("Aucune notification.");

  out += csvRow([...NOTIFICATION_HEADERS]);
  for (const notification of dossier.notifications) {
    out += csvRow([
      iso(notification.createdAt),
      readable(notification.createdAt),
      notification.type,
      notification.ticketNumber === null ? "" : `#${notification.ticketNumber}`,
      notification.excerpt,
      readable(notification.readAt),
    ]);
  }
  return out;
}

/**
 * Tout le dossier sauf le journal : de l'en-tête jusqu'à la ligne de titres du
 * bloc « journal d'audit », que la route remplira ensuite lot par lot.
 */
export function subjectCsvHead({
  dossier,
  generatedAt,
  requestedByName,
  requestedByEmail,
}: {
  dossier: SubjectDossier;
  generatedAt: Date;
  requestedByName: string;
  requestedByEmail: string;
}): string {
  return (
    CSV_BOM +
    csvRow(["DOSSIER DES DONNÉES PERSONNELLES"]) +
    csvRow([
      "Extrait le",
      `${readable(generatedAt)} (${iso(generatedAt)})`,
      "Par",
      requestedByName,
      requestedByEmail,
    ]) +
    csvRow([
      "Portée",
      "Toutes les données que l'application détient sur cette personne, hors mentions ci-dessous.",
    ]) +
    identityBlock(dossier) +
    ticketsBlock(dossier) +
    messagesBlock(dossier) +
    attachmentsBlock(dossier) +
    notificationsBlock(dossier) +
    blockTitle("JOURNAL D'AUDIT") +
    csvRow([...AUDIT_CSV_HEADERS])
  );
}

/**
 * Dernier bloc : ce que le fichier ne contient pas.
 *
 * Placé en fin et non en tête pour ne pas retarder les données, mais il fait
 * partie de la réponse : un dossier qui se présente comme complet alors qu'il
 * laisse de côté le contenu des champs personnalisés ou les octets des fichiers
 * induit en erreur la personne qui le reçoit comme celle qui le remet.
 */
export function subjectCsvTail(dossier: SubjectDossier, journalEntryCount: number): string {
  let out = "";
  if (journalEntryCount === 0) out += emptyBlock("Aucune entrée de journal.");

  out += blockTitle("CE QUE CE DOSSIER NE CONTIENT PAS");
  for (const limit of dossier.limits) {
    out += csvRow([limit]);
  }
  return out;
}
