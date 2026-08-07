"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Recherche de la personne visée par une demande.
 *
 * Dans l'URL et non dans un état local, comme la barre du journal : le lien se
 * partage et se recharge, ce qui compte quand on documente le traitement d'une
 * demande (« voilà l'écran depuis lequel j'ai répondu »).
 *
 * Rien ne s'affiche tant qu'on n'a pas tapé : cet écran porte deux gestes
 * irréversibles, il n'a pas à proposer d'emblée la liste de tout le monde.
 */
export function SubjectSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) {
        params.set("q", term);
      } else {
        params.delete("q");
      }
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      if (next !== `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`) {
        router.push(next);
      }
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Email, nom ou société de la personne concernée…"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="h-10 bg-card pl-8"
          autoFocus
        />
      </div>
      {term && (
        <Button
          variant="ghost"
          size="sm"
          className="h-10 text-muted-foreground"
          onClick={() => setTerm("")}
        >
          <X className="size-4" />
          Effacer
        </Button>
      )}
    </div>
  );
}
