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

export function renderTicketReplyEmailHtml({
  ticketNumber,
  senderName,
  bodyText,
}: {
  ticketNumber: number;
  senderName: string;
  bodyText: string;
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
                <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">${escapeHtml(senderName)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Ticket #${ticketNumber}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;font-size:14px;line-height:1.6;color:#18181b;">
                ${textToHtmlParagraphs(bodyText)}
              </td>
            </tr>
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

export function renderTicketReplyEmailText({
  ticketNumber,
  senderName,
  bodyText,
}: {
  ticketNumber: number;
  senderName: string;
  bodyText: string;
}) {
  return `${bodyText}\n\n—\n${senderName} · Ticket #${ticketNumber}\nVous pouvez répondre directement à cet email pour continuer la conversation.`;
}
