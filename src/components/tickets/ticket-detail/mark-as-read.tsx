"use client";

import { useEffect } from "react";
import { markTicketAsRead } from "@/lib/actions/tickets";

/**
 * Fires only after a real client-side mount (post-hydration) — never during
 * server rendering. That distinction matters here: Next's <Link> prefetches
 * routes on viewport/hover by default, which would re-render this page's
 * Server Component (and, if the mutation lived there, mark tickets "read"
 * just from appearing in a list — not from an agent actually opening one).
 */
export function MarkAsRead({ ticketId, hasUnreadActivity }: { ticketId: string; hasUnreadActivity: boolean }) {
  useEffect(() => {
    if (hasUnreadActivity) {
      markTicketAsRead(ticketId);
    }
  }, [ticketId, hasUnreadActivity]);

  return null;
}
