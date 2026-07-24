import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

// `gmail.modify` covers read, label, and send — everything except permanent
// deletion — so a single scope is enough for both inbound sync and outbound
// replies. `userinfo.email` lets us read back which address the agent
// connected without asking for it manually.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Intégration Gmail non configurée : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_OAUTH_REDIRECT_URI sont requis."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl() {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces Google to always return a refresh_token, not just on first consent
    scope: GMAIL_SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Returns an authenticated Gmail API client for the single connected support
 * inbox, or null if no account is connected. Persists rotated access tokens
 * back to the database transparently as Google refreshes them.
 */
export async function getAuthenticatedGmailClient() {
  const account = await prisma.emailAccount.findFirst();
  if (!account) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry?.getTime(),
  });

  client.on("tokens", (tokens) => {
    const data: { accessToken?: string; refreshToken?: string; tokenExpiry?: Date } = {};
    if (tokens.access_token) data.accessToken = tokens.access_token;
    if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) data.tokenExpiry = new Date(tokens.expiry_date);

    if (Object.keys(data).length > 0) {
      prisma.emailAccount.update({ where: { id: account.id }, data }).catch(() => {
        // Best-effort persistence: a failed write here just means the next
        // API call re-triggers a refresh, not a broken integration.
      });
    }
  });

  return { gmail: google.gmail({ version: "v1", auth: client }), account };
}
