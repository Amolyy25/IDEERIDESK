"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setAgentApproval } from "@/lib/actions/agents";
import { formatDateTime } from "@/lib/format-date";
import type { Agent } from "@/generated/prisma/client";

/**
 * Demandes d'accès à trancher : comptes créés à la première connexion Google
 * (PENDING) et comptes déjà refusés (REJECTED), qu'un admin peut encore
 * approuver s'il change d'avis.
 */
export function PendingAgentsSection({
  requests,
  isAdmin,
}: {
  requests: Agent[];
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Ligne retirée localement dès la décision : la revalidation serveur
  // confirme derrière, mais l'admin voit sa liste se vider immédiatement.
  const [decided, setDecided] = useState<Record<string, boolean>>({});

  const rows = requests.filter((agent) => !decided[agent.id]);

  if (rows.length === 0) return null;

  function decide(agent: Agent, approved: boolean) {
    setDecided((current) => ({ ...current, [agent.id]: true }));

    startTransition(async () => {
      try {
        const { emailSent } = await setAgentApproval(agent.id, approved);
        if (!approved) {
          toast.success(`Accès refusé pour ${agent.name}.`);
        } else if (emailSent) {
          toast.success(`${agent.name} a été approuvé — email de confirmation envoyé.`);
        } else {
          toast.success(
            `${agent.name} a été approuvé. Email non envoyé (boîte Gmail non connectée).`
          );
        }
      } catch (error) {
        setDecided((current) => {
          const next = { ...current };
          delete next[agent.id];
          return next;
        });
        toast.error(error instanceof Error ? error.message : "Décision impossible");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Demandes d&apos;accès</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Comptes créés à la première connexion Google. Tant qu&apos;ils ne sont pas approuvés,
        ils n&apos;accèdent à aucune page de l&apos;espace agent.
        {!isAdmin && " Seul un administrateur peut trancher."}
      </p>

      <ul className="divide-y rounded-lg border">
        {rows.map((agent) => (
          <li key={agent.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                <span className="truncate">{agent.name}</span>
                {agent.approvalStatus === "REJECTED" && (
                  <Badge variant="outline" className="text-destructive">
                    Refusé
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {agent.email} · demande du {formatDateTime(agent.createdAt)}
              </p>
            </div>

            {isAdmin && (
              <div className="flex shrink-0 items-center gap-2">
                {agent.approvalStatus === "PENDING" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => decide(agent, false)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Refuser
                  </Button>
                )}
                <Button size="sm" disabled={isPending} onClick={() => decide(agent, true)}>
                  <Check className="h-3.5 w-3.5" />
                  Approuver
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
