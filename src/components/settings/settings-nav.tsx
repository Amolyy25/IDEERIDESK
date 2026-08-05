"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { visibleSettingsGroups, type SettingsItem } from "@/lib/settings-navigation";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Navigation des réglages : colonne latérale sur grand écran, bande
 * horizontale défilante en dessous de `lg`. Une section que l'agent n'a pas la
 * permission d'ouvrir est masquée plutôt que d'aboutir à un message de refus.
 */
export function SettingsNav({ permissions }: { permissions: PermissionKey[] }) {
  const pathname = usePathname();

  const groups = visibleSettingsGroups(permissions);

  // Une sous-page (ex. l'éditeur d'une source) garde sa section parente active.
  const isActive = (item: SettingsItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      <nav
        className="hidden lg:sticky lg:top-6 lg:col-start-1 lg:row-start-1 lg:block lg:self-start"
        aria-label="Réglages"
      >
        {groups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                    className={cn(
                      "relative block rounded-md px-2 py-1.5 text-sm transition-colors",
                      "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
                      isActive(item)
                        ? "bg-muted font-medium text-foreground before:opacity-100"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <nav
        className="-mx-6 flex gap-1 overflow-x-auto px-6 pb-1 lg:hidden"
        aria-label="Réglages"
      >
        {groups.flatMap((group) =>
          group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
                isActive(item)
                  ? "border-transparent bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          )),
        )}
      </nav>
    </>
  );
}
