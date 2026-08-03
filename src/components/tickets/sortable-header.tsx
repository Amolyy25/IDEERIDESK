"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortableHeader({ sortKey, label }: { sortKey: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSortBy = searchParams.get("sortBy") ?? "createdAt";
  const currentSortDir = searchParams.get("sortDir") ?? "desc";
  const isActive = currentSortBy === sortKey;
  const nextDir = isActive && currentSortDir === "asc" ? "desc" : "asc";

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", sortKey);
    params.set("sortDir", nextDir);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const Icon = isActive ? (currentSortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1 text-xs font-medium whitespace-nowrap",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}
