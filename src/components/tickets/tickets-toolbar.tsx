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
import { UNASSIGNED_FILTER } from "@/lib/ticket-filters";
import { cn } from "@/lib/utils";
import type { TicketStatus, TicketPriority, TicketCategory, Agent } from "@/generated/prisma/client";

const ALL = "__all__";

export function TicketsToolbar({
  statuses,
  priorities,
  categories,
  agents,
  currentAgentId,
}: {
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: Agent[];
  /** Agent connecté, pour l'entrée « Mes tickets » du filtre d'assignation. */
  currentAgentId: string | null;
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
    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function resetFilters() {
    setSearch("");
    router.push(pathname);
  }

  // Ce que l'agent a posé lui-même, et qu'il doit pouvoir retirer d'un geste.
  const filterKeys = ["search", "statusId", "priorityId", "categoryId", "assigneeId"];
  const hasActiveFilters = filterKeys.some((key) => searchParams.get(key));

  /** Un filtre posé se voit sur son propre contrôle, pas seulement dans la liste. */
  function triggerClass(key: string, width: string) {
    if (searchParams.get(key)) {
      return cn("h-9 bg-card border-primary/50 text-foreground", width);
    }
    return cn("h-9 bg-card", width);
  }

  return (
    // Barre de filtres : deuxième bandeau de la carte, même gouttière `px-4`
    // et même fond que les onglets — la zone blanche en dessous est réservée
    // aux données.
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un ticket…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64 bg-card pl-8"
        />
      </div>

      <Select
        value={searchParams.get("statusId") ?? ALL}
        onValueChange={(v) => setFilter("statusId", v)}
      >
        <SelectTrigger className={triggerClass("statusId", "w-40")}>
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les statuts</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              {status.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("priorityId") ?? ALL}
        onValueChange={(v) => setFilter("priorityId", v)}
      >
        <SelectTrigger className={triggerClass("priorityId", "w-40")}>
          <SelectValue placeholder="Priorité" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes les priorités</SelectItem>
          {priorities.map((priority) => (
            <SelectItem key={priority.id} value={priority.id}>
              {priority.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("categoryId") ?? ALL}
        onValueChange={(v) => setFilter("categoryId", v)}
      >
        <SelectTrigger className={triggerClass("categoryId", "w-44")}>
          <SelectValue placeholder="Produit concerné" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les produits concernés</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("assigneeId") ?? ALL}
        onValueChange={(v) => setFilter("assigneeId", v)}
      >
        <SelectTrigger className={triggerClass("assigneeId", "w-44")}>
          <SelectValue placeholder="Assigné à" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les agents</SelectItem>
          {/* Les deux vues quotidiennes d'un support, qu'il fallait jusqu'ici
              reconstituer à la main : ce qui n'a pris personne, et ce qui est à
              moi. « Non assigné » est une valeur réservée, aucun agent ne peut
              porter cet identifiant. */}
          <SelectItem value={UNASSIGNED_FILTER}>Non assigné</SelectItem>
          {currentAgentId && <SelectItem value={currentAgentId}>Mes tickets</SelectItem>}
          {agents
            .filter((agent) => agent.id !== currentAgentId)
            .map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

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
