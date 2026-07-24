import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createOAuthClient, exchangeCodeForTokens } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

function redirectToSettings(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/email", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get("error");
  if (error) {
    return redirectToSettings(request, { error });
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectToSettings(request, { error: "Code d'autorisation manquant." });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return redirectToSettings(request, {
        error:
          "Google n'a pas renvoyé de refresh token. Révoquez l'accès dans votre compte Google puis réessayez.",
      });
    }

    const client = createOAuthClient();
    client.setCredentials(tokens);
    const { data: profile } = await google.oauth2({ version: "v2", auth: client }).userinfo.get();

    if (!profile.email) {
      return redirectToSettings(request, {
        error: "Impossible de récupérer l'adresse email du compte Google.",
      });
    }

    // Un seul compte connecté à la fois.
    await prisma.emailAccount.deleteMany({});
    await prisma.emailAccount.create({
      data: {
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    return redirectToSettings(request, { connected: "1" });
  } catch {
    return redirectToSettings(request, {
      error: "La connexion à Gmail a échoué. Merci de réessayer.",
    });
  }
}
