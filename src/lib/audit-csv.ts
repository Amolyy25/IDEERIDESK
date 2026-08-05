import { auditActionFamily, auditActionLabel, parseAuditChanges } from "@/lib/audit-actions";
import type { AuditLogEntry } from "@/lib/audit-query";

/**
 * Sérialisation CSV du journal d'audit.
 *
 * Deux décisions de format, prises pour que le fichier s'ouvre correctement chez
 * les personnes qui vont réellement le lire (une équipe française, sous Excel) :
 *
 * — **séparateur point-virgule.** Excel en locale française attend `;` et non
 *   `,` ; avec une virgule, tout atterrit dans une seule colonne.
 * — **BOM UTF-8 en tête de fichier.** Sans lui, Excel lit le fichier en ANSI et
 *   affiche « Ticket clos » en « Ticket closÂ ». Les accents sont partout dans ces
 *   libellés, ce n'est pas un détail cosmétique.
 *
 * Les dates sont écrites en ISO 8601 (`2026-08-05T18:06:56.060Z`) : c'est le seul
 * format qui se trie correctement comme du texte et qui reste non ambigu entre
 * conventions jour/mois. La colonne « Quand (lisible) » l'accompagne pour la
 * lecture humaine.
 */

export const CSV_SEPARATOR = ";";
export const CSV_BOM = "﻿";

export const AUDIT_CSV_HEADERS = [
  "Horodatage (ISO 8601)",
  "Quand (lisible)",
  "Agent",
  "Email agent",
  "Nature",
  "Action",
  "Ticket",
  "Sujet du ticket",
  "Ticket supprimé",
  "Détail",
] as const;

const FAMILY_LABELS = {
  CONSULTATION: "Consultation",
  REPONSE: "Réponse",
  MODIFICATION: "Modification",
} as const;

const readableDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

/**
 * Échappement d'une cellule.
 *
 * Le préfixe sur `=`, `+`, `-` et `@` n'est pas décoratif : une cellule qui
 * commence par l'un d'eux est interprétée comme une FORMULE par Excel et
 * LibreOffice (injection de formule CSV). Or le sujet d'un ticket vient d'un
 * formulaire public — donc de l'extérieur. Sans ce préfixe, un sujet
 * `=HYPERLINK(...)` déposé par un tiers s'exécuterait sur le poste de la personne
 * qui ouvre l'export.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  // Guillemets doublés, et cellule toujours entourée : un sujet de ticket peut
  // contenir un point-virgule, un retour à la ligne ou un guillemet.
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR) + "\r\n";
}

/** Le « quoi » d'une entrée, aplati en une cellule lisible. */
export function auditDetailText(entry: AuditLogEntry): string {
  const changes = parseAuditChanges(entry.changes);

  if (changes.length > 0) {
    return changes
      .map((change) =>
        change.from !== undefined && change.to !== undefined
          ? `${change.label} : ${change.from} → ${change.to}`
          : change.label,
      )
      .join(" | ");
  }

  return entry.summary ?? "";
}

export function auditCsvLine(entry: AuditLogEntry): string {
  return csvRow([
    entry.createdAt.toISOString(),
    readableDate.format(entry.createdAt),
    entry.actorName,
    entry.actorEmail,
    FAMILY_LABELS[auditActionFamily(entry.action)],
    auditActionLabel(entry.action),
    entry.ticketNumber === null ? "" : `#${entry.ticketNumber}`,
    entry.ticketSubject ?? "",
    // `ticketNumber` renseigné mais `ticketId` nul = le ticket a été supprimé
    // depuis. L'information compte dans un export : elle explique pourquoi le
    // dossier est introuvable dans l'application.
    entry.ticketNumber !== null && entry.ticketId === null ? "oui" : "",
    auditDetailText(entry),
  ]);
}

export function auditCsvHeader(): string {
  return CSV_BOM + csvRow([...AUDIT_CSV_HEADERS]);
}

/** Nom de fichier daté, pour que plusieurs exports ne s'écrasent pas. */
export function auditCsvFilename(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `journal-audit-${stamp}.csv`;
}
