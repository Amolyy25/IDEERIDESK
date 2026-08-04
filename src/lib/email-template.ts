import { escapeHtml } from "@/lib/escape-html";
import { renderEmailLayout } from "@/lib/email-layout";

/**
 * Contenu de chaque email sortant.
 *
 * Ici on ne construit que le corps : l'habillage (fond, carte, en-tête, pied de
 * page) vient du gabarit administrable, voir `email-layout.ts`. Chaque fonction
 * `render…EmailHtml` reçoit donc `layoutHtml`, lu en base par l'appelant
 * (`getEmailLayoutHtml`).
 *
 * Les fragments produits ici sont autonomes : ils ne supposent pas d'être posés
 * dans un tableau précis, pour qu'un gabarit réécrit de zéro continue de les
 * accueillir.
 */

function textToHtmlParagraphs(text: string) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function optionalText(value: string | null | undefined) {
  if (value) return value;
  return "";
}

export type EmailHistoryEntry = {
  authorLabel: string;
  content: string;
  createdAt: Date;
};

function formatHistoryDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderHistoryHtml(history: EmailHistoryEntry[]) {
  if (history.length === 0) return "";

  const rows = history
    .map(
      (entry) => `
      <tr>
        <td style="padding:14px 0;border-top:1px solid #e4e4e7;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#52525b;">
            ${escapeHtml(entry.authorLabel)}
            <span style="font-weight:400;color:#a1a1aa;"> · ${formatHistoryDate(entry.createdAt)}</span>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#52525b;white-space:pre-wrap;">${escapeHtml(entry.content)}</p>
        </td>
      </tr>`
    )
    .join("");

  return `
    <p style="margin:20px 0 0;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#a1a1aa;">
      Historique de la conversation
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows}
    </table>`;
}

/** Encadré gris clair : rappel de la demande, note interne, état du ticket… */
function renderInfoBox({ label, body }: { label: string; body: string }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#a1a1aa;">
            ${escapeHtml(label)}
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#52525b;white-space:pre-wrap;">${body}</p>
        </td>
      </tr>
    </table>`;
}

function renderButton({ url, label }: { url: string | null; label: string }) {
  if (!url) return "";

  return `
    <p style="margin:20px 0 4px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </p>`;
}

/**
 * Signature de l'agent, entre le corps de la réponse et l'historique.
 *
 * Le HTML arrive déjà assaini et ses variables déjà remplies (voir
 * `signature.ts` et `signature-store.ts`) : il est inséré tel quel. Aucune
 * signature configurée = aucun bloc, pas même un séparateur vide.
 *
 * Exportée pour l'aperçu de /settings/signatures, qui doit montrer la signature
 * avec la même typographie qu'à l'envoi.
 */
export function renderSignatureBlockHtml(signatureHtml: string | null | undefined) {
  if (!signatureHtml) return "";

  return `
    <div style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#52525b;">
      ${signatureHtml}
    </div>`;
}

function renderSignatureBlockText(signatureHtml: string | null | undefined) {
  if (!signatureHtml) return "";

  return `\n\n${stripHtmlForText(signatureHtml)}`;
}

function renderHistoryText(history: EmailHistoryEntry[]) {
  if (history.length === 0) return "";

  const entries = history
    .map((entry) => `${entry.authorLabel} · ${formatHistoryDate(entry.createdAt)}\n${entry.content}`)
    .join("\n\n");

  return `\n\n---\nHistorique de la conversation\n\n${entries}`;
}

export function renderTicketReplyEmailHtml({
  layoutHtml,
  ticketNumber,
  senderName,
  bodyText,
  history = [],
  signatureHtml,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  ticketNumber: number;
  senderName: string;
  bodyText: string;
  history?: EmailHistoryEntry[];
  /** Signature de l'agent auteur de la réponse, variables déjà remplies. */
  signatureHtml?: string | null;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName,
    headline: `Ticket #${ticketNumber}`,
    content: `${textToHtmlParagraphs(bodyText)}${renderSignatureBlockHtml(signatureHtml)}${renderHistoryHtml(history)}`,
    footer: "Vous pouvez répondre directement à cet email pour continuer la conversation.",
  }, origin);
}

// L'email de clôture est rédigé par un admin via un éditeur riche (HTML déjà
// formé, pas du texte brut à échapper/paragraphes comme `bodyText` ailleurs
// dans ce fichier) — il est inséré tel quel dans le gabarit.
export function renderTicketClosureEmailHtml({
  layoutHtml,
  ticketNumber,
  senderName,
  bodyHtml,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  ticketNumber: number;
  senderName: string;
  bodyHtml: string;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName,
    headline: `Ticket #${ticketNumber} · Clôturé`,
    content: bodyHtml,
    footer: "",
  }, origin);
}

/**
 * Corps proposé dans /settings/acknowledgement quand aucun modèle n'est encore
 * enregistré. Rien n'est envoyé tant qu'un admin ne l'a pas validé.
 */
export const DEFAULT_ACKNOWLEDGEMENT_BODY_HTML = `<p>Bonjour,</p><p>Nous avons bien reçu votre demande et notre équipe support la prend en charge.</p><p>Vous recevrez une réponse dans les meilleurs délais. Conservez cet email : vous pouvez y répondre pour nous transmettre toute information complémentaire.</p><p>Merci de votre confiance.</p>`;

// Accusé de réception envoyé dès la création d'un ticket depuis un formulaire
// public. Comme la clôture, le corps est rédigé par un admin dans un éditeur
// riche : `bodyHtml` est déjà du HTML, inséré tel quel.
export function renderTicketAcknowledgementEmailHtml({
  layoutHtml,
  ticketNumber,
  ticketSubject,
  senderName,
  bodyHtml,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  ticketNumber: number;
  ticketSubject: string;
  senderName: string;
  bodyHtml: string;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  const recap = renderInfoBox({
    label: "Votre demande",
    body: `#${ticketNumber} — ${escapeHtml(ticketSubject)}`,
  });

  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName,
    headline: `Ticket #${ticketNumber} · Demande reçue`,
    content: `${bodyHtml}${recap}`,
    footer: "Vous pouvez répondre directement à cet email pour compléter votre demande.",
  }, origin);
}

export function renderTicketAcknowledgementEmailText({
  ticketNumber,
  ticketSubject,
  senderName,
  bodyHtml,
}: {
  ticketNumber: number;
  ticketSubject: string;
  senderName: string;
  bodyHtml: string;
}) {
  return `${stripHtmlForText(bodyHtml)}

Votre demande
#${ticketNumber} — ${ticketSubject}

—
${senderName} · Ticket #${ticketNumber}
Vous pouvez répondre directement à cet email pour compléter votre demande.`;
}

function stripHtmlForText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
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

export function renderTicketClosureEmailText({
  ticketNumber,
  senderName,
  bodyHtml,
}: {
  ticketNumber: number;
  senderName: string;
  bodyHtml: string;
}) {
  return `${stripHtmlForText(bodyHtml)}\n\n—\n${senderName} · Ticket #${ticketNumber} · Clôturé`;
}

// Email interne (destinataire = un agent Ideeri, pas un client) envoyé quand
// un admin approuve une demande d'accès à l'espace agent.
export function renderAgentApprovalEmailHtml({
  layoutHtml,
  agentName,
  appUrl,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  agentName: string;
  appUrl: string | null;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  let ctaUrl = null;
  if (appUrl) {
    ctaUrl = `${appUrl}/tickets`;
  }

  const content = `
    <p style="margin:0 0 16px;">Bonjour ${escapeHtml(agentName)},</p>
    <p style="margin:0 0 16px;">
      Votre demande d'accès à l'espace agent Ideeri Desk vient d'être validée
      par un administrateur. Vous pouvez dès maintenant vous connecter avec
      votre compte Google.
    </p>
    ${renderButton({ url: ctaUrl, label: "Ouvrir Ideeri Desk" })}`;

  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName: "Ideeri Desk",
    headline: "Accès validé",
    content,
    footer: "Email automatique — inutile d'y répondre.",
  }, origin);
}

// Email interne également : prévient un agent qu'un collègue l'a mentionné en
// @ dans une note interne. Le corps reprend la note telle quelle — une note
// interne ne quitte jamais l'équipe, `to` est toujours une adresse Ideeri.
export function renderAgentMentionEmailHtml({
  layoutHtml,
  recipientName,
  actorName,
  ticketNumber,
  ticketSubject,
  noteContent,
  ticketUrl,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  recipientName: string;
  actorName: string;
  ticketNumber: number;
  ticketSubject: string;
  noteContent: string;
  ticketUrl: string | null;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  const content = `
    <p style="margin:0 0 16px;">Bonjour ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(actorName)}</strong> vous a mentionné dans une note interne
      du ticket #${ticketNumber} — ${escapeHtml(ticketSubject)}.
    </p>
    ${renderInfoBox({ label: "Note interne", body: escapeHtml(noteContent) })}
    ${renderButton({ url: ticketUrl, label: "Ouvrir le ticket" })}`;

  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName: "Ideeri Desk",
    headline: `Vous avez été mentionné · Ticket #${ticketNumber}`,
    content,
    footer: "Email automatique — répondez depuis le ticket, pas par email.",
  }, origin);
}

/** Ticket confié à un agent. Même famille d'email interne que la mention. */
export function renderTicketAssignedEmailHtml({
  layoutHtml,
  recipientName,
  actorName,
  ticketNumber,
  ticketSubject,
  statusName,
  priorityName,
  ticketUrl,
  logoUrl,
  origin,
}: {
  layoutHtml: string;
  recipientName: string;
  actorName: string;
  ticketNumber: number;
  ticketSubject: string;
  statusName: string;
  priorityName: string;
  ticketUrl: string | null;
  logoUrl?: string | null;
  /** Adresse publique de l'application, ajoutée aux images. Voir `renderEmailLayout`. */
  origin?: string;
}) {
  const content = `
    <p style="margin:0 0 16px;">Bonjour ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(actorName)}</strong> vous a assigné le ticket
      #${ticketNumber} — ${escapeHtml(ticketSubject)}.
    </p>
    ${renderInfoBox({
      label: "État",
      body: `${escapeHtml(statusName)} · priorité ${escapeHtml(priorityName)}`,
    })}
    ${renderButton({ url: ticketUrl, label: "Ouvrir le ticket" })}`;

  return renderEmailLayout(layoutHtml, {
    logoUrl: optionalText(logoUrl),
    senderName: "Ideeri Desk",
    headline: `Ticket qui vous est confié · #${ticketNumber}`,
    content,
    footer: "Email automatique — répondez depuis le ticket, pas par email.",
  }, origin);
}

export function renderTicketAssignedEmailText({
  recipientName,
  actorName,
  ticketNumber,
  ticketSubject,
  statusName,
  priorityName,
  ticketUrl,
}: {
  recipientName: string;
  actorName: string;
  ticketNumber: number;
  ticketSubject: string;
  statusName: string;
  priorityName: string;
  ticketUrl: string | null;
}) {
  let cta = "";
  if (ticketUrl) {
    cta = `\n\nOuvrir le ticket : ${ticketUrl}`;
  }

  return `Bonjour ${recipientName},

${actorName} vous a assigné le ticket #${ticketNumber} — ${ticketSubject}.

État
${statusName} · priorité ${priorityName}${cta}

—
Email automatique — répondez depuis le ticket, pas par email.`;
}

export function renderAgentMentionEmailText({
  recipientName,
  actorName,
  ticketNumber,
  ticketSubject,
  noteContent,
  ticketUrl,
}: {
  recipientName: string;
  actorName: string;
  ticketNumber: number;
  ticketSubject: string;
  noteContent: string;
  ticketUrl: string | null;
}) {
  let cta = "";
  if (ticketUrl) {
    cta = `\n\nOuvrir le ticket : ${ticketUrl}`;
  }

  return `Bonjour ${recipientName},

${actorName} vous a mentionné dans une note interne du ticket #${ticketNumber} — ${ticketSubject}.

Note interne
${noteContent}${cta}

—
Email automatique — répondez depuis le ticket, pas par email.`;
}

export function renderAgentApprovalEmailText({
  agentName,
  appUrl,
}: {
  agentName: string;
  appUrl: string | null;
}) {
  let cta = "";
  if (appUrl) {
    cta = `\n\nOuvrir Ideeri Desk : ${appUrl}/tickets`;
  }

  return `Bonjour ${agentName},

Votre demande d'accès à l'espace agent Ideeri Desk vient d'être validée par un administrateur. Vous pouvez dès maintenant vous connecter avec votre compte Google.${cta}

—
Email automatique — inutile d'y répondre.`;
}

export function renderTicketReplyEmailText({
  ticketNumber,
  senderName,
  bodyText,
  history = [],
  signatureHtml,
}: {
  ticketNumber: number;
  senderName: string;
  bodyText: string;
  history?: EmailHistoryEntry[];
  signatureHtml?: string | null;
}) {
  return `${bodyText}${renderSignatureBlockText(signatureHtml)}${renderHistoryText(history)}\n\n—\n${senderName} · Ticket #${ticketNumber}\nVous pouvez répondre directement à cet email pour continuer la conversation.`;
}
