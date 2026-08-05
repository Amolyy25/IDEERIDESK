"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Catégories et modèles n'existent que pour organiser et rédiger : un lecteur
// n'y trouverait que des formulaires qui refusent d'enregistrer.
const tabs = [
  { label: "Articles", href: "/knowledge-base", manageOnly: false },
  { label: "Catégories", href: "/knowledge-base/categories", manageOnly: true },
  { label: "Modèles", href: "/knowledge-base/templates", manageOnly: true },
];

export function KbTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const visibleTabs = tabs.filter((tab) => canManage || !tab.manageOnly);

  return (
    <div className="flex gap-1 border-b">
      {visibleTabs.map((tab) => {
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
