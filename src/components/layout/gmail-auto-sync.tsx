"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerManualGmailSync } from "@/lib/actions/gmail-sync";

const SYNC_INTERVAL_MS = 60_000;

/**
 * Invisible background poller, mounted app-wide whenever Gmail is connected.
 * There's no real webhook (Gmail push requires a Google Cloud Pub/Sub topic
 * this project doesn't provision) and no manual "sync now" button either —
 * this poller is the only way inbound replies ever reach the dashboard.
 */
export function GmailAutoSync() {
  const router = useRouter();
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        const result = await triggerManualGmailSync();
        if (result.connected && result.appended > 0) {
          toast.info(`${result.appended} nouveau(x) message(s) reçu(s)`);
          router.refresh();
        }
      } catch {
        // Sync silencieuse en arrière-plan : une erreur ponctuelle ne doit
        // pas interrompre l'agent, le prochain cycle réessaiera seul.
      } finally {
        isSyncingRef.current = false;
      }
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
