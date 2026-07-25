"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/tickets/status-dot";
import { SourceBadge } from "@/components/tickets/source-badge";
import { formatDateTime } from "@/lib/format-date";
import { claimTicket, closeTicket } from "@/lib/actions/tickets";
import type { TicketWithMessages } from "@/lib/actions/tickets";

/**
 * En-tête collant de la fiche ticket : identité du ticket à gauche, actions
 * principales à droite. « Clore » et « Prendre en charge » vivaient au bas du
 * panneau d'attributs, souvent hors écran — ce sont les deux gestes les plus
 * fréquents, ils restent maintenant visibles pendant toute la lecture du fil.
 */
export function TicketHeader({
  ticket,
  currentAgentId,
}: {
  ticket: TicketWithMessages;
  currentAgentId: string | null;
}) {
  const router = useRouter();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const canClaim = Boolean(currentAgentId) && ticket.assigneeId !== currentAgentId;

  async function handleClaim() {
    setIsClaiming(true);
    try {
      await claimTicket(ticket.id);
      toast.success("Ticket pris en charge");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de prendre en charge");
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleClose() {
    setIsClosing(true);
    try {
      const result = await closeTicket(ticket.id);
      toast.success(
        result.emailSent ? "Ticket clos, email envoyé au client" : "Ticket clos",
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de clore ce ticket");
    } finally {
      setIsClosing(false);
    }
  }

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Tickets
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm text-muted-foreground">#{ticket.number}</span>
            <h1 className="truncate text-xl font-semibold tracking-tight">{ticket.subject}</h1>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <StatusDot color={ticket.status.color} label={ticket.status.name} />
            <StatusDot color={ticket.priority.color} label={ticket.priority.name} />
            <SourceBadge source={ticket.source} />
            <span>Créé le {formatDateTime(ticket.createdAt)}</span>
            {ticket.closedAt && (
              <Badge variant="secondary">Clos le {formatDateTime(ticket.closedAt)}</Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canClaim && (
            <Button variant="outline" size="sm" onClick={handleClaim} disabled={isClaiming}>
              <UserPlus className="h-3.5 w-3.5" />
              {isClaiming ? "…" : "Prendre en charge"}
            </Button>
          )}
          {!ticket.closedAt && (
            <Button size="sm" onClick={handleClose} disabled={isClosing}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isClosing ? "Clôture…" : "Clore ce ticket"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
