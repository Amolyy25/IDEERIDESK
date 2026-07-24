"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Articles", href: "/knowledge-base" },
  { label: "Catégories", href: "/knowledge-base/categories" },
  { label: "Modèles", href: "/knowledge-base/templates" },
];

export function KbTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/knowledge-base"
            ? pathname === "/knowledge-base" ||
              (pathname.startsWith("/knowledge-base/") &&
                !pathname.startsWith("/knowledge-base/categories") &&
                !pathname.startsWith("/knowledge-base/templates"))
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
