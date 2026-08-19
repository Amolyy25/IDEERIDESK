import { noteAnchor } from "@/lib/note-replies";
import type { NotificationItem } from "@/lib/actions/notifications";

/**
 * Libellé d'une notification, partagé par la cloche et le toast de la relève de
 * fond — les deux affichaient la même phrase, chacun avec sa copie.
 */
export type NotificationDisplay = {
  /** Tête de ligne en gras : l'auteur, ou l'origine pour une alerte système. */
  lead: string;
  /** Ce qui suit la tête de ligne. Vide pour une alerte système : tout est dans l'extrait. */
  action: string;
  /** Null quand la notification ne mène nulle part. */
  href: string | null;
  tone: "info" | "warning";
};

export function describeNotification(item: NotificationItem): NotificationDisplay {
  if (item.type === "SYSTEM_ALERT") {
    return { lead: "Alerte système", action: "", href: null, tone: "warning" };
  }

  return {
    lead: item.actor?.name ?? "Un agent",
    action: item.type === "ASSIGNMENT" ? "vous a assigné un ticket" : "vous a mentionné",
    href: ticketHref(item),
    tone: "info",
  };
}

export function notificationToast(item: NotificationItem) {
  const { lead, action } = describeNotification(item);
  if (!action) return item.excerpt;

  const onTicket = item.ticket ? ` · ticket #${item.ticket.number}` : "";
  return `${lead} ${action}${onTicket}`;
}

// Seules les notes portent une ancre dans le fil (voir `MessageTimelineItem`) :
// une notification d'assignation retombe sur le ticket.
function ticketHref(item: NotificationItem) {
  if (!item.ticket) return "/tickets";
  const ticket = `/tickets/${item.ticket.id}`;
  return item.messageId ? `${ticket}#${noteAnchor(item.messageId)}` : ticket;
}
