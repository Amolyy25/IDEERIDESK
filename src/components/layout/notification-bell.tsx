"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationRow } from "@/components/layout/notification-item";
import type { NotificationItem } from "@/lib/actions/notifications";

/**
 * Cloche des notifications internes — mentions @, tickets confiés et pannes des
 * services de fond. Purement présentationnelle : l'état et la relève viennent
 * de `useBackgroundSync`, appelé une seule fois par la barre latérale — c'est
 * ce qui garantit un seul intervalle de polling par onglet.
 */
export function NotificationBell({
  items,
  unreadCount,
  onOpen,
  onRead,
  onReadAll,
}: {
  items: NotificationItem[];
  unreadCount: number;
  onOpen: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) onOpen();
      }}
    >
      <PopoverTrigger
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
            : "Notifications"
        }
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[10px] font-semibold tabular-nums text-sidebar-primary-foreground">
            {unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onReadAll}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Tout marquer comme lu
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Aucune notification pour l&apos;instant.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow
                  item={item}
                  onSelect={() => {
                    setIsOpen(false);
                    if (!item.readAt) onRead(item.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
