"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, initials } from "@/lib/utils";
import { BookOpen, Settings, Ticket, Users } from "lucide-react";
import { SignOutButton } from "@/components/layout/sign-out-button";

const navItems = [
  { label: "Tickets", href: "/tickets", icon: Ticket },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Base de connaissances", href: null, icon: BookOpen },
  { label: "Paramètres", href: "/settings", icon: Settings },
];

type CurrentAgent = { name: string | null | undefined; email: string | null | undefined };

export function Sidebar({ currentAgent }: { currentAgent: CurrentAgent }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="h-2 w-2 rounded-sm bg-primary" />
        <span className="text-sm font-semibold tracking-tight">Ideeri Desk</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {navItems.map((item) => {
          const isActive = item.href ? pathname.startsWith(item.href) : false;
          const Icon = item.icon;

          if (!item.href) {
            return (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-sidebar-border px-3 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-medium">
          {initials(currentAgent.name || currentAgent.email || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-foreground">
            {currentAgent.name || currentAgent.email}
          </p>
          {currentAgent.name && currentAgent.email && (
            <p className="truncate text-[11px] text-sidebar-foreground/50">{currentAgent.email}</p>
          )}
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
