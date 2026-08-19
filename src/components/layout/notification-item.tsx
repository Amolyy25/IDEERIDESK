"use client";

import Link from "next/link";
import { AtSign, ShieldAlert, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/format-date";
import { describeNotification } from "@/lib/notification-display";
import type { NotificationItem } from "@/lib/actions/notifications";

const ICONS = {
  MENTION: AtSign,
  ASSIGNMENT: UserPlus,
  SYSTEM_ALERT: ShieldAlert,
} as const;

/** Une ligne de la cloche. Devient un bouton quand la notification ne mène nulle part. */
export function NotificationRow({
  item,
  onSelect,
}: {
  item: NotificationItem;
  onSelect: () => void;
}) {
  const { lead, action, href, tone } = describeNotification(item);
  const Icon = ICONS[item.type];

  const body = (
    <>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          item.readAt
            ? "text-muted-foreground"
            : tone === "warning"
              ? "text-destructive"
              : "text-primary"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">
          <span className="font-medium">{lead}</span>
          {action && ` ${action}`}
          {item.ticket && (
            <span className="text-muted-foreground">
              {" "}
              · #{item.ticket.number} {item.ticket.subject}
            </span>
          )}
        </span>
        {/* L'extrait porte tout le message d'une alerte système : tronqué sur une
            ligne, il perdrait la cause de la panne et le nombre de fichiers. */}
        <span
          className={cn(
            "mt-0.5 block text-xs text-muted-foreground",
            action ? "truncate" : "line-clamp-3"
          )}
        >
          {item.excerpt}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
          {formatRelativeDate(item.createdAt)}
        </span>
      </span>
    </>
  );

  const className = cn(
    "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
    !item.readAt && "bg-primary/5"
  );

  if (!href) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href} onClick={onSelect} className={className}>
      {body}
    </Link>
  );
}
