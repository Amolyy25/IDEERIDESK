"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TicketStatus, TicketPriority, TicketCategory, Agent } from "@/generated/prisma/client";

const ALL = "__all__";

export function TicketsToolbar({
  statuses,
  priorities,
  categories,
  agents,
}: {
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  categories: TicketCategory[];
  agents: Agent[];
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Rechercher un ticket…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 w-64"
      />

      <Select
        value={searchParams.get("statusId") ?? ALL}
        onValueChange={(v) => setFilter("statusId", v)}
      >
        <SelectTrigger className="h-9 w-40">
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
        <SelectTrigger className="h-9 w-40">
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
        <SelectTrigger className="h-9 w-44">
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
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Assigné à" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les agents</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
