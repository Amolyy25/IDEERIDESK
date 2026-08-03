"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ShieldCheck,
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

type NavItem = { label: string; href: string; icon: LucideIcon };

// Le travail quotidien en haut, groupé par nature ; la configuration en bas,
// près de la fiche agent — elle ne se consulte pas au même rythme.
const APPROVALS_ITEM: NavItem = { label: "Validations", href: "/approvals", icon: ShieldCheck };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Support",
    items: [{ label: "Tickets", href: "/tickets", icon: Ticket }],
  },
  {
    label: "Répertoire",
    items: [
      { label: "Clients", href: "/clients", icon: Users },
      { label: "Équipe", href: "/agents", icon: UsersRound },
    ],
  },
  {
    label: "Contenu",
    items: [{ label: "Base de connaissances", href: "/knowledge-base", icon: BookOpen }],
  },
];

const SETTINGS_ITEM: NavItem = { label: "Paramètres", href: "/settings", icon: Settings };

type CurrentAgent = { name: string | null | undefined; email: string | null | undefined };

/** Ce que compte la pastille, pour un lecteur d'écran : un nombre nu ne dit rien. */
function badgeLabel(href: string, count: number) {
  const plural = count > 1 ? "s" : "";
  if (href === "/agents") return `${count} demande${plural} d'accès en attente`;
  if (href === APPROVALS_ITEM.href) return `${count} réponse${plural} en attente de validation`;
  return `${count} ticket${plural} avec de l'activité non lue`;
}

function NavLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge: number | null;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-foreground before:opacity-100"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "opacity-80")} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== null && (
        <span
          aria-label={badgeLabel(item.href, badge)}
          className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[10px] font-semibold tabular-nums text-sidebar-primary-foreground"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  currentAgent,
  unreadCount,
  pendingAgentCount,
  canApprove,
  pendingApprovalCount,
  notifications,
  unreadNotificationCount,
  gmailConnected,
}: {
  currentAgent: CurrentAgent;
  unreadCount: number;
  /** Demandes d'accès en attente — toujours 0 pour un non-admin. */
  pendingAgentCount: number;
  /** Agent habilité à valider les réponses : conditionne l'entrée « Validations ». */
  canApprove: boolean;
  /** Réponses retenues en attente de validation — toujours 0 sans `canApprove`. */
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
  // attente sur l'équipe (admins seuls), réponses à valider (agents habilités).
  const badgeFor = (href: string) => {
    if (href === "/tickets") return unreadCount > 0 ? unreadCount : null;
    if (href === "/agents") return pendingAgentCount > 0 ? pendingAgentCount : null;
    if (href === APPROVALS_ITEM.href) {
      return pendingApprovalCount > 0 ? pendingApprovalCount : null;
    }
    return null;
  };

  // L'entrée n'apparaît que pour qui peut s'en servir : ailleurs, la page
  // renvoie vers les tickets.
  const navGroups = canApprove
    ? NAV_GROUPS.map((group) =>
        group.label === "Support" ? { ...group, items: [...group.items, APPROVALS_ITEM] } : group
      )
    : NAV_GROUPS;

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
        {/* Le logo est un JPEG sur fond blanc : le cadrage circulaire épouse le
            rond de la marque et fait disparaître les coins blancs. */}
        <Image
          src="/logoIdeeri.jpeg"
          alt="Ideeri"
          width={28}
          height={28}
          priority
          className="h-7 w-7 shrink-0 rounded-full object-cover"
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

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
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

      <div className="shrink-0 px-3 pb-2">
        <NavLink
          item={SETTINGS_ITEM}
          active={isActive(SETTINGS_ITEM.href)}
          badge={null}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-medium ring-1 ring-inset ring-white/10">
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
