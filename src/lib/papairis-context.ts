export type PapairisContext = {
  userEmail?: string;
  userName?: string;
  userId?: string;
  sourceUrl?: string;
  appVersion?: string;
  papairisClientId?: string;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Resolved server-side from Next's `searchParams` page prop (never from
 * `window.location`) so the initial context is identical on the server render
 * and the client's first hydration pass — reading it client-side would branch
 * on `typeof window`, a classic hydration-mismatch source.
 */
export function parseContextFromSearchParams(params: RawSearchParams): PapairisContext {
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const context: PapairisContext = {};
  const userEmail = get("user_email");
  const userName = get("user_name");
  const userId = get("user_id");
  const sourceUrl = get("source_url");
  const appVersion = get("app_version");
  const papairisClientId = get("papairis_client_id");

  if (userEmail) context.userEmail = userEmail;
  if (userName) context.userName = userName;
  if (userId) context.userId = userId;
  if (sourceUrl) context.sourceUrl = sourceUrl;
  if (appVersion) context.appVersion = appVersion;
  if (papairisClientId) context.papairisClientId = papairisClientId;

  return context;
}

const PAPAIRIS_CONTEXT_MESSAGE_TYPE = "papairis:context";
export const PAPAIRIS_CLOSE_MESSAGE_TYPE = "papairis:close";
export const PAPAIRIS_TICKET_CREATED_MESSAGE_TYPE = "papairis:ticket-created";

export function isPapairisContextMessage(
  data: unknown
): data is { type: typeof PAPAIRIS_CONTEXT_MESSAGE_TYPE; payload: PapairisContext } {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as { type?: unknown; payload?: unknown };
  return (
    candidate.type === PAPAIRIS_CONTEXT_MESSAGE_TYPE &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}
