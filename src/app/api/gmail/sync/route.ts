import { NextRequest, NextResponse } from "next/server";
import { syncGmailInbox } from "@/lib/gmail-sync";

/**
 * Polling-based inbound sync, meant to be called on a schedule (Vercel Cron,
 * an external scheduler, etc.) since Gmail push notifications require a
 * Google Cloud Pub/Sub topic and domain verification this project doesn't
 * provision. Protected by a shared secret since it mutates data.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GMAIL_SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await syncGmailInbox();
  return NextResponse.json(result);
}
