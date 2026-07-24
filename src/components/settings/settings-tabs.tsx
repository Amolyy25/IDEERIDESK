"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Général", href: "/settings/general" },
  { label: "Portail", href: "/settings/portal" },
  { label: "Statuts de ticket", href: "/settings/statuses" },
  { label: "Priorités", href: "/settings/priorities" },
  { label: "Produits concernés", href: "/settings/categories" },
  { label: "Champs personnalisés", href: "/settings/custom-fields" },
  { label: "E-mail", href: "/settings/email" },
  { label: "Clôture", href: "/settings/closure" },
  { label: "IA", href: "/settings/ai" },
  { label: "Automatisations", href: "/settings/automations" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
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
