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

export function RelativeTime({
  date,
  className = "text-sm text-muted-foreground",
}: {
  date: Date | string;
  className?: string;
}) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatRelativeDate(date),
    getServerSnapshot
  );

  return <span className={className}>{label ?? " "}</span>;
}
