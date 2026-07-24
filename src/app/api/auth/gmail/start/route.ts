import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-oauth";
import { requireAdmin } from "@/lib/require-permission";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.redirect(getGoogleAuthUrl());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configuration Gmail invalide.";
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/settings/email?error=${encodeURIComponent(message)}`
    );
  }
}
