import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GMAIL_OAUTH_STATE_COOKIE, getGoogleAuthUrl } from "@/lib/google-oauth";
import { requirePermission } from "@/lib/require-permission";

// Durée de vie du `state` : le temps d'un écran de consentement Google, pas plus.
const STATE_TTL_SECONDS = 10 * 60;

export async function GET() {
  try {
    await requirePermission("settings.email");

    // Lie ce départ au retour : le callback refusera un code d'autorisation
    // qui n'est pas accompagné de ce même `state`.
    const state = randomUUID();
    const store = await cookies();
    store.set(GMAIL_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });

    return NextResponse.redirect(getGoogleAuthUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configuration Gmail invalide.";
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/settings/email?error=${encodeURIComponent(message)}`
    );
  }
}
