import { NextRequest, NextResponse } from "next/server";
import { syncGmailInbox } from "@/lib/gmail-sync";
import { hasValidCronSecret } from "@/lib/cron-secret";

/**
 * Polling-based inbound sync, meant to be called on a schedule (Vercel Cron,
 * an external scheduler, etc.) since Gmail push notifications require a
 * Google Cloud Pub/Sub topic and domain verification this project doesn't
 * provision. Protected by a shared secret since it mutates data — transmis par
 * en-tête `x-sync-secret` uniquement (voir `hasValidCronSecret`).
 */
export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request, "x-sync-secret", process.env.GMAIL_SYNC_SECRET)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await syncGmailInbox();
  return NextResponse.json(result);
}
