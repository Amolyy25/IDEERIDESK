import {
  renderAgentApprovalEmailHtml,
  renderTicketAcknowledgementEmailHtml,
  renderTicketAssignedEmailHtml,
  renderTicketClosureEmailHtml,
  renderTicketReplyEmailHtml,
} from "@/lib/email-template";

/**
 * Exemples d'emails rendus avec le gabarit en cours d'édition, pour l'aperçu
 * de /settings/email-layout.
 *
 * Les données sont fictives — un aperçu ne doit jamais afficher les
 * coordonnées d'un vrai client. Le logo est chargé depuis l'application elle
 * même : à l'envoi, c'est une URL absolue construite sur APP_URL.
 */

const PREVIEW_LOGO_URL = "/logoIdeeri.jpeg";
const PREVIEW_TICKET_URL = "https://exemple.invalid/tickets/apercu";

// Chaque exemple est choisi pour couvrir une forme de contenu différente :
// texte seul, encadré de rappel, bouton d'action, historique.
export const EMAIL_PREVIEW_SAMPLES = [
  {
    id: "reply",
    label: "Réponse au client",
    render: (layoutHtml: string) =>
      renderTicketReplyEmailHtml({
        layoutHtml,
        ticketNumber: 18,
        senderName: "Ideeri Support",
        bodyText:
          "Bonjour Jean Dupont,\n\nVotre demande est bien prise en charge. Nous revenons vers vous dès que la correction est déployée.\n\nBonne journée.",
        // Signature d'exemple, variables déjà remplies : sa place dans l'email
        // (sous le message, avant l'historique) fait partie de ce que l'aperçu
        // doit montrer. Le contenu réel se règle dans /settings/signatures.
        signatureHtml:
          "<p><strong>Camille Martin</strong><br>Support Ideeri<br>camille.martin@example.com</p>",
        history: [
          {
            authorLabel: "Jean Dupont",
            content: "Bonjour, l'export des mandats ne se termine pas.",
            createdAt: new Date("2026-01-12T09:24:00Z"),
          },
        ],
        logoUrl: PREVIEW_LOGO_URL,
      }),
  },
  {
    id: "acknowledgement",
    label: "Accusé de réception",
    render: (layoutHtml: string) =>
      renderTicketAcknowledgementEmailHtml({
        layoutHtml,
        ticketNumber: 42,
        ticketSubject: "Export des mandats interrompu",
        senderName: "Ideeri Support",
        bodyHtml:
          "<p>Bonjour,</p><p>Nous avons bien reçu votre demande et notre équipe support la prend en charge.</p>",
        logoUrl: PREVIEW_LOGO_URL,
      }),
  },
  {
    id: "closure",
    label: "Clôture",
    render: (layoutHtml: string) =>
      renderTicketClosureEmailHtml({
        layoutHtml,
        ticketNumber: 18,
        senderName: "Ideeri Support",
        bodyHtml: "<p>Merci de votre ticket, il a été clôturé.</p>",
        logoUrl: PREVIEW_LOGO_URL,
      }),
  },
  {
    id: "assigned",
    label: "Ticket assigné (interne)",
    render: (layoutHtml: string) =>
      renderTicketAssignedEmailHtml({
        layoutHtml,
        recipientName: "Camille Martin",
        actorName: "Jean Dupont",
        ticketNumber: 57,
        ticketSubject: "Synchronisation des annonces bloquée",
        statusName: "En cours",
        priorityName: "Haute",
        ticketUrl: PREVIEW_TICKET_URL,
        logoUrl: PREVIEW_LOGO_URL,
      }),
  },
  {
    id: "approval",
    label: "Accès validé (interne)",
    render: (layoutHtml: string) =>
      renderAgentApprovalEmailHtml({
        layoutHtml,
        agentName: "Camille Martin",
        appUrl: "https://exemple.invalid",
        logoUrl: PREVIEW_LOGO_URL,
      }),
  },
];

export type EmailPreviewSample = (typeof EMAIL_PREVIEW_SAMPLES)[number];
