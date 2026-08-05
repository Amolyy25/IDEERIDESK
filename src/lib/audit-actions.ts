import type { AuditAction } from "@/generated/prisma/client";

/**
 * Registre des gestes tracés par le journal d'audit.
 *
 * Seul endroit du code qui sait comment se nomme une action et à quelle famille
 * elle appartient : le filtre de la page, les libellés du tableau et les
 * pastilles s'en déduisent. Ajouter une valeur à l'enum `AuditAction` sans
 * l'ajouter ici casse la compilation (la table `AUDIT_ACTIONS` est exhaustive
 * par construction), ce qui est exactement le rappel voulu.
 *
 * Aucune directive `"use server"` ici : le registre est importé par le tableau
 * (composant client) comme par les actions serveur.
 */

/**
 * Les trois natures de geste que le journal distingue. C'est la question que
 * pose un audit : qui a seulement REGARDÉ un dossier, qui a PARLÉ au client,
 * qui a TOUCHÉ à la donnée.
 */
export type AuditFamily = "CONSULTATION" | "REPONSE" | "MODIFICATION";

export const AUDIT_FAMILIES: { value: AuditFamily; label: string }[] = [
  { value: "CONSULTATION", label: "Consultation" },
  { value: "REPONSE", label: "Réponse" },
  { value: "MODIFICATION", label: "Modification" },
];

type AuditActionMeta = {
  /** Libellé au passé, tel qu'affiché dans la colonne « Action ». */
  label: string;
  family: AuditFamily;
};

export const AUDIT_ACTIONS: Record<AuditAction, AuditActionMeta> = {
  TICKET_VIEWED: { label: "Ticket consulté", family: "CONSULTATION" },
  TICKET_CREATED: { label: "Ticket créé", family: "MODIFICATION" },
  TICKET_REPLIED: { label: "Réponse au client", family: "REPONSE" },
  TICKET_NOTE_ADDED: { label: "Note interne", family: "REPONSE" },
  TICKET_UPDATED: { label: "Ticket modifié", family: "MODIFICATION" },
  TICKET_CLAIMED: { label: "Prise en charge", family: "MODIFICATION" },
  TICKET_CLOSED: { label: "Ticket clos", family: "MODIFICATION" },
  TICKET_DELETED: { label: "Ticket supprimé", family: "MODIFICATION" },
  TICKET_MERGED: { label: "Tickets fusionnés", family: "MODIFICATION" },
  TICKET_UNMERGED: { label: "Fusion annulée", family: "MODIFICATION" },
  REPLY_APPROVED: { label: "Réponse validée", family: "REPONSE" },
  REPLY_REJECTED: { label: "Réponse refusée", family: "REPONSE" },
  AGENT_ACCESS_GRANTED: { label: "Accès approuvé", family: "MODIFICATION" },
  AGENT_ACCESS_DENIED: { label: "Accès refusé", family: "MODIFICATION" },
  AGENT_PERMISSIONS_UPDATED: { label: "Permissions modifiées", family: "MODIFICATION" },
};

/** Actions listées dans l'ordre du registre, pour le filtre déroulant. */
export const AUDIT_ACTION_VALUES = Object.keys(AUDIT_ACTIONS) as AuditAction[];

export function auditActionLabel(action: AuditAction) {
  return AUDIT_ACTIONS[action].label;
}

export function auditActionFamily(action: AuditAction): AuditFamily {
  return AUDIT_ACTIONS[action].family;
}

/** Actions d'une famille — c'est ainsi que le filtre « nature » se traduit en requête. */
export function actionsInFamily(family: AuditFamily): AuditAction[] {
  return AUDIT_ACTION_VALUES.filter((action) => AUDIT_ACTIONS[action].family === family);
}

export function isAuditFamily(value: string): value is AuditFamily {
  return AUDIT_FAMILIES.some((family) => family.value === value);
}

export function isAuditAction(value: string): value is AuditAction {
  return value in AUDIT_ACTIONS;
}

/**
 * Un champ touché par une modification.
 *
 * `from` et `to` sont déjà des libellés lisibles (« Nouveau », « Non assigné »),
 * jamais des identifiants : la ligne du journal doit se lire des années plus
 * tard, quand le statut concerné a peut-être été renommé ou supprimé.
 *
 * Les deux sont facultatifs, pour le cas où le journal dit QUE le champ a changé
 * sans en recopier le contenu — c'est le choix fait pour les champs
 * personnalisés, dont la valeur peut être une donnée personnelle.
 */
export type AuditChange = {
  label: string;
  from?: string;
  to?: string;
};

/** Lecture défensive du champ `changes` (JSON libre côté base). */
export function parseAuditChanges(value: unknown): AuditChange[] {
  if (!Array.isArray(value)) return [];

  const isOptionalString = (candidate: unknown) =>
    candidate === undefined || typeof candidate === "string";

  return value.filter(
    (entry): entry is AuditChange =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as AuditChange).label === "string" &&
      isOptionalString((entry as AuditChange).from) &&
      isOptionalString((entry as AuditChange).to),
  );
}
