"use client";

import { useState } from "react";
import { ChevronDown, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

// Repliée par défaut : dépliée, une signature avec logo occupe plus de hauteur que la
// zone de rédaction et repousse le bouton d'envoi hors de l'écran.
export function SignatureDisclosure({
  agentName,
  children,
}: {
  agentName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 hover:text-foreground"
      >
        <PenLine className="size-3.5 shrink-0" />
        {/* Espaces explicites autour du nom : une espace en fin de ligne JSX est
            supprimée à la compilation, et « MEILLERajoutée » se recollait. */}
        <span>
          Signature de{" "}
          <span className="font-medium text-foreground">{agentName}</span>{" "}
          ajoutée à l&apos;email
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {/* Hauteur bornée : une signature avec un grand logo ne doit pas reprendre
          tout l'espace qu'on vient de lui retirer. */}
      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-dashed bg-background/60 px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
