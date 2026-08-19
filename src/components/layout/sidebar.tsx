"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChartColumn,
  ScrollText,
  ShieldCheck,
  ShieldUser,
  Settings,
  Ticket,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useBackgroundSync } from "@/components/layout/use-background-sync";
import type { NotificationItem } from "@/lib/actions/notifications";
import { CommandPalette } from "@/components/layout/command-palette/command-palette";
import { visibleNavGroups } from "@/lib/app-navigation";
import { can, canAny, permissionsInGroup, type PermissionKey } from "@/lib/permissions";

/** Une entrée « Paramètres » n'a de sens que pour qui peut ouvrir au moins une section. */
const SETTINGS_PERMISSIONS = permissionsInGroup("settings");

/**
 * Les icônes vivent ici et non dans le plan (`src/lib/app-navigation.ts`) : ce
 * plan est lu par du code serveur — redirections, page d'atterrissage — qui n'a
 * que faire de composants React. Même partage que `settings-navigation.ts`.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/tickets": Ticket,
  "/approvals": ShieldCheck,
  "/clients": Users,
  "/agents": UsersRound,
  "/knowledge-base": BookOpen,
  "/stats": ChartColumn,
  "/audit": ScrollText,
  "/privacy": ShieldUser,
};

const SETTINGS_ITEM = {
  label: "Paramètres",
  href: "/settings",
  keywords: ["settings", "reglages", "configuration", "preferences"],
};

type CurrentAgent = { name: string | null | undefined; email: string | null | undefined };

/** Ce que compte la pastille, pour un lecteur d'écran : un nombre nu ne dit rien. */
function badgeLabel(href: string, count: number) {
  const plural = count > 1 ? "s" : "";
  if (href === "/agents") return `${count} demande${plural} d'accès en attente`;
  if (href === "/approvals") return `${count} réponse${plural} en attente de validation`;
  return `${count} ticket${plural} avec de l'activité non lue`;
}

function NavLink({
  item,
  active,
  badge,
}: {
  item: { label: string; href: string };
  active: boolean;
  badge: number | null;
}) {
  const Icon = NAV_ICONS[item.href] ?? Settings;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-foreground before:opacity-100"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "opacity-80")} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== null && (
        <span
          aria-label={badgeLabel(item.href, badge)}
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold tabular-nums text-sidebar-primary-foreground"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  currentAgent,
  permissions,
  unreadCount,
  pendingAgentCount,
  pendingApprovalCount,
  notifications,
  unreadNotificationCount,
  gmailConnected,
}: {
  currentAgent: CurrentAgent;
  /** Permissions déjà résolues de l'agent connecté : décident des entrées affichées. */
  permissions: PermissionKey[];
  unreadCount: number;
  /** Demandes d'accès en attente — toujours 0 sans « team.view ». */
  pendingAgentCount: number;
  /** Réponses retenues en attente de validation — toujours 0 sans « approvals.handle ». */
  pendingApprovalCount: number;
  /** Mentions @ reçues par l'agent connecté. */
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  /** Boîte support connectée : conditionne le volet « emails » de la relève de fond. */
  gmailConnected: boolean;
}) {
  const pathname = usePathname();

  // La barre latérale est le seul composant monté sur toutes les pages de
  // l'espace agent : c'est ici que vit l'unique horloge d'arrière-plan
  // (réception des emails + des mentions), pas dans deux composants séparés.
  const notificationState = useBackgroundSync({
    gmailConnected,
    initialItems: notifications,
    initialUnreadCount: unreadNotificationCount,
  });

  // Une fiche ou une sous-page garde sa section parente active, sans qu'un
  // préfixe de route en attrape une autre (`/agents` vs `/agents-archive`).
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Trois pastilles : activité non lue sur les tickets, demandes d'accès en
  // attente sur l'équipe, réponses à valider.
  const badgeFor = (href: string) => {
    if (href === "/tickets") return unreadCount > 0 ? unreadCount : null;
    if (href === "/agents") return pendingAgentCount > 0 ? pendingAgentCount : null;
    if (href === "/approvals") return pendingApprovalCount > 0 ? pendingApprovalCount : null;
    return null;
  };

  // Les entrées n'apparaissent que pour qui peut s'en servir : ailleurs, la page
  // renvoie vers la première section accessible.
  const navGroups = visibleNavGroups(permissions);
  const showSettings = canAny(permissions, SETTINGS_PERMISSIONS);

  // La palette cherche d'abord des tickets : sans « tickets.view », il ne lui
  // resterait que les liens déjà présents juste en dessous.
  const palettePages = [
    ...navGroups.flatMap((group) => group.items),
    ...(showSettings ? [SETTINGS_ITEM] : []),
  ];

  return (
    // `app-sidebar` porte le fond : la couleur opaque et les voiles de dégradé
    // qui la sculptent sont décrits ensemble dans globals.css.
    <aside className="app-sidebar flex h-full w-60 flex-col border-r border-sidebar-border text-sidebar-foreground">
      <div className="flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        {/* Le logo est un JPEG sur fond blanc : le cadrage circulaire épouse le
            rond de la marque et fait disparaître les coins blancs. */}
        <Image
          src="/logoIdeeri.jpeg"
          alt="Ideeri"
          width={32}
          height={32}
          priority
          className="size-8 shrink-0 rounded-full object-cover"
        />
        <span className="flex-1 truncate text-sm font-semibold tracking-tight">Ideeri Desk</span>
        <NotificationBell
          items={notificationState.items}
          unreadCount={notificationState.unreadCount}
          onOpen={notificationState.refreshOnDemand}
          onRead={notificationState.markRead}
          onReadAll={notificationState.markAllRead}
        />
      </div>

      {can(permissions, "tickets.view") && (
        <div className="shrink-0 px-3 pt-3">
          <CommandPalette pages={palettePages} />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-2 text-[11px] font-medium tracking-wide text-sidebar-foreground/40 uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isActive(item.href)}
                    badge={badgeFor(item.href)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {showSettings && (
        <div className="shrink-0 px-3 pb-2">
          <NavLink item={SETTINGS_ITEM} active={isActive(SETTINGS_ITEM.href)} badge={null} />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-medium ring-1 ring-inset ring-white/10">
          {initials(currentAgent.name || currentAgent.email || "?")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-foreground">
            {currentAgent.name || currentAgent.email}
          </p>
          {currentAgent.name && currentAgent.email && (
            <p className="truncate text-[11px] text-sidebar-foreground/50">
              {currentAgent.email}
            </p>
          )}
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
