"use client";

import { useSyncExternalStore } from "react";
import { formatRelativeDate } from "@/lib/format-date";

function subscribe(onChange: () => void) {
  const interval = setInterval(onChange, 30_000);
  return () => clearInterval(interval);
}

function getServerSnapshot() {
  return null;
}

export function RelativeTime({ date }: { date: Date | string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatRelativeDate(date),
    getServerSnapshot
  );

  return <span className="text-sm text-muted-foreground">{label ?? " "}</span>;
}
