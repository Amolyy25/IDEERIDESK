function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtmlParagraphs(text: string) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
            <tr>
              <td style="padding:4px 32px 24px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#a1a1aa;">
                  Historique de la conversation
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>`;
}

function renderHistoryText(history: EmailHistoryEntry[]) {
  if (history.length === 0) return "";

  const entries = history
    .map((entry) => `${entry.authorLabel} · ${formatHistoryDate(entry.createdAt)}\n${entry.content}`)
    .join("\n\n");

  return `\n\n---\nHistorique de la conversation\n\n${entries}`;
}

export function renderTicketReplyEmailHtml({
  ticketNumber,
  senderName,
  bodyText,
  history = [],
  logoUrl,
}: {
  ticketNumber: number;
  senderName: string;
  bodyText: string;
  history?: EmailHistoryEntry[];
  logoUrl?: string | null;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:3px solid #eab308;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 4px;">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Ideeri" height="24" style="display:block;margin-bottom:14px;border:0;" />` : ""}
                <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">${escapeHtml(senderName)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Ticket #${ticketNumber}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;font-size:14px;line-height:1.6;color:#18181b;">
                ${textToHtmlParagraphs(bodyText)}
              </td>
            </tr>
            ${renderHistoryHtml(history)}
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;">
                <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
                  Vous pouvez répondre directement à cet email pour continuer la conversation.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// L'email de clôture est rédigé par un admin via un éditeur riche (HTML déjà
// formé, pas du texte brut à échapper/paragraphes comme `bodyText` ailleurs
// dans ce fichier) — il est inséré tel quel dans le gabarit.
export function renderTicketClosureEmailHtml({
  ticketNumber,
  senderName,
  bodyHtml,
  logoUrl,
}: {
  ticketNumber: number;
  senderName: string;
  bodyHtml: string;
  logoUrl?: string | null;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:3px solid #eab308;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 4px;">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Ideeri" height="24" style="display:block;margin-bottom:14px;border:0;" />` : ""}
                <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">${escapeHtml(senderName)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Ticket #${ticketNumber} · Clôturé</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;font-size:14px;line-height:1.6;color:#18181b;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  ticketNumber,
  ticketSubject,
  senderName,
  bodyHtml,
  logoUrl,
}: {
  ticketNumber: number;
  ticketSubject: string;
  senderName: string;
  bodyHtml: string;
  logoUrl?: string | null;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:3px solid #eab308;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 4px;">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Ideeri" height="24" style="display:block;margin-bottom:14px;border:0;" />` : ""}
                <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">${escapeHtml(senderName)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Ticket #${ticketNumber} · Demande reçue</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;font-size:14px;line-height:1.6;color:#18181b;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:4px 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#a1a1aa;">
                        Votre demande
                      </p>
                      <p style="margin:0;font-size:13px;line-height:1.6;color:#52525b;">
                        #${ticketNumber} — ${escapeHtml(ticketSubject)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;">
                <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
                  Vous pouvez répondre directement à cet email pour compléter votre demande.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  agentName,
  appUrl,
  logoUrl,
}: {
  agentName: string;
  appUrl: string | null;
  logoUrl?: string | null;
}) {
  const ctaUrl = appUrl ? `${appUrl}/tickets` : null;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:3px solid #eab308;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 4px;">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Ideeri" height="24" style="display:block;margin-bottom:14px;border:0;" />` : ""}
                <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">Ideeri Desk</p>
                <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Accès validé</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;font-size:14px;line-height:1.6;color:#18181b;">
                <p style="margin:0 0 16px;">Bonjour ${escapeHtml(agentName)},</p>
                <p style="margin:0 0 16px;">
                  Votre demande d'accès à l'espace agent Ideeri Desk vient d'être validée
                  par un administrateur. Vous pouvez dès maintenant vous connecter avec
                  votre compte Google.
                </p>
                ${
                  ctaUrl
                    ? `<p style="margin:0 0 16px;">
                  <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">Ouvrir Ideeri Desk</a>
                </p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;">
                <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
                  Email automatique — inutile d'y répondre.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderAgentApprovalEmailText({
  agentName,
  appUrl,
}: {
  agentName: string;
  appUrl: string | null;
}) {
  const cta = appUrl ? `\n\nOuvrir Ideeri Desk : ${appUrl}/tickets` : "";
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
}: {
  ticketNumber: number;
  senderName: string;
  bodyText: string;
  history?: EmailHistoryEntry[];
}) {
  return `${bodyText}${renderHistoryText(history)}\n\n—\n${senderName} · Ticket #${ticketNumber}\nVous pouvez répondre directement à cet email pour continuer la conversation.`;
}
