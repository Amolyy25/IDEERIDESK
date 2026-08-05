import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  createOAuthClient,
  exchangeCodeForTokens,
} from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

function redirectToSettings(request: NextRequest, params: Record<string, string>) {
  // Derrière le proxy Railway, `request.url` reflète l'hôte interne du
  // conteneur (ex: localhost:8080), pas le domaine public — on privilégie
  // APP_URL, la seule source fiable de l'URL publique réelle.
  const base = process.env.APP_URL || request.url;
  const url = new URL("/settings/email", base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function sameState(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  // Ce callback ÉCRIT la boîte support de toute l'équipe : il doit être protégé
  // aussi strictement que la route de départ. Sans ces deux contrôles, un tiers
  // qui obtient un code d'autorisation pour notre client_id (il peut en générer
  // un avec son propre compte Google) fait remplacer la boîte connectée par la
  // sienne — toutes les réponses clients partiraient alors de chez lui.
  const store = await cookies();
  const expectedState = store.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  // Le cookie ne sert qu'à cet aller-retour : consommé quoi qu'il arrive, pour
  // qu'un `state` ne soit jamais rejouable.
  store.delete(GMAIL_OAUTH_STATE_COOKIE);

  try {
    await requirePermission("settings.email");
  } catch {
    return redirectToSettings(request, {
      error: "Connexion Gmail réservée aux administrateurs.",
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get("error");
  if (error) {
    return redirectToSettings(request, { error });
  }

  const state = searchParams.get("state");
  if (!expectedState || !state || !sameState(expectedState, state)) {
    return redirectToSettings(request, {
      error: "Requête de connexion Gmail invalide ou expirée. Relancez la connexion.",
    });
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
  } catch (error) {
    // Message seul : la réponse d'erreur d'un échange de jetons peut contenir
    // des éléments d'authentification.
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    console.error(`[gmail/callback] échec de la connexion Gmail : ${reason}`);
    return redirectToSettings(request, {
      error: "La connexion à Gmail a échoué. Merci de réessayer.",
    });
  }
}
