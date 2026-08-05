"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUDIT_ACTION_VALUES,
  AUDIT_FAMILIES,
  auditActionFamily,
  auditActionLabel,
} from "@/lib/audit-actions";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** Les clés que l'administrateur pose lui-même, et doit pouvoir retirer d'un geste. */
const FILTER_KEYS = ["search", "actorId", "family", "action", "from", "to"];

export function AuditToolbar({
  actors,
}: {
  /** Agents ayant laissé au moins une trace (voir `getAuditActors`). */
  actors: { id: string; name: string; entryCount: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
      params.set("page", "1");
      const next = `${pathname}?${params.toString()}`;
      if (next !== `${pathname}?${searchParams.toString()}`) {
        router.push(next);
      }
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Changer de nature de geste vide l'action précise : garder « Ticket clos »
    // sélectionné en passant sur « Consultation » donnerait une liste vide sans
    // que l'administrateur comprenne quel filtre s'y oppose.
    if (key === "family") {
      params.delete("action");
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function resetFilters() {
    setSearch("");
    router.push(pathname);
  }

  const activeFamily = searchParams.get("family");
  const hasActiveFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  /** Un filtre posé se voit sur son propre contrôle, pas seulement dans la liste. */
  function triggerClass(key: string, width: string) {
    if (searchParams.get(key)) {
      return cn("h-9 bg-card border-primary/50 text-foreground", width);
    }
    return cn("h-9 bg-card", width);
  }

  // Le second menu se restreint à la nature choisie dans le premier : les deux se
  // lisent alors comme un entonnoir, du général au précis.
  const availableActions = activeFamily
    ? AUDIT_ACTION_VALUES.filter((action) => auditActionFamily(action) === activeFamily)
    : AUDIT_ACTION_VALUES;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="N° de ticket, sujet, agent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 bg-card pl-8"
        />
      </div>

      <Select
        value={searchParams.get("actorId") ?? ALL}
        onValueChange={(v) => setFilter("actorId", v)}
      >
        <SelectTrigger className={triggerClass("actorId", "w-44")}>
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les agents</SelectItem>
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={activeFamily ?? ALL} onValueChange={(v) => setFilter("family", v)}>
        <SelectTrigger className={triggerClass("family", "w-40")}>
          <SelectValue placeholder="Nature" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les gestes</SelectItem>
          {AUDIT_FAMILIES.map((family) => (
            <SelectItem key={family.value} value={family.value}>
              {family.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("action") ?? ALL}
        onValueChange={(v) => setFilter("action", v)}
      >
        <SelectTrigger className={triggerClass("action", "w-48")}>
          <SelectValue placeholder="Action précise" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes les actions</SelectItem>
          {availableActions.map((action) => (
            <SelectItem key={action} value={action}>
              {auditActionLabel(action)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Les deux bornes de date sont natives : un journal se filtre « du 1er au
          31 », et le sélecteur du navigateur fait ce travail sans dépendance. */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="audit-from" className="text-xs text-muted-foreground">
          Du
        </label>
        <Input
          id="audit-from"
          type="date"
          value={searchParams.get("from") ?? ""}
          onChange={(e) => setFilter("from", e.target.value)}
          className={cn("h-9 w-[9.5rem] bg-card", searchParams.get("from") && "border-primary/50")}
        />
        <label htmlFor="audit-to" className="text-xs text-muted-foreground">
          au
        </label>
        <Input
          id="audit-to"
          type="date"
          value={searchParams.get("to") ?? ""}
          onChange={(e) => setFilter("to", e.target.value)}
          className={cn("h-9 w-[9.5rem] bg-card", searchParams.get("to") && "border-primary/50")}
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="h-9 text-muted-foreground"
        >
          <X className="size-4" />
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
