"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Lock, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/tickets/source-badge";
import { formatDateTime } from "@/lib/format-date";
import { claimTicket, closeTicket } from "@/lib/actions/tickets";
import type { TicketWithMessages } from "@/lib/actions/tickets";

/**
 * En-tête collant de la fiche ticket : ce qu'on doit savoir sans redescendre, et
 * les deux gestes les plus fréquents.
 *
 * Le statut et la priorité sont rendus par des pastilles portant la couleur
 * choisie dans les réglages, pas par du texte gris : l'état d'un ticket doit se
 * voir avant d'être lu. Le client figure ici parce que la question « à qui
 * est-ce que je réponds ? » se pose pendant toute la lecture du fil, alors que
 * le panneau d'attributs défile de son côté.
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
      toast.success(result.emailSent ? "Ticket clos, email envoyé au client" : "Ticket clos");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de clore ce ticket");
    } finally {
      setIsClosing(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex min-h-[4.5rem] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/tickets"
            aria-label="Retour à la liste des tickets"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                #{ticket.number}
              </span>
              <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">
                {ticket.subject}
              </h1>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <AttributePill color={ticket.status.color} label={ticket.status.name} />
              <AttributePill color={ticket.priority.color} label={ticket.priority.name} />
              <SourceBadge source={ticket.source} className="text-[11px]" />
              {ticket.client && (
                <span className="truncate" title={ticket.client.email}>
                  {ticket.client.name}
                </span>
              )}
              <span className="hidden sm:inline">Ouvert le {formatDateTime(ticket.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {ticket.closedAt && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Lock className="size-3" />
              Clos le {formatDateTime(ticket.closedAt)}
            </Badge>
          )}
          {canClaim && (
            <Button size="sm" onClick={handleClaim} disabled={isClaiming}>
              <UserPlus />
              {isClaiming ? "Attribution…" : "Prendre en charge"}
            </Button>
          )}
          {/* Clore est en retrait : c'est l'action qui met fin à l'échange et
              déclenche un email au client, elle n'a pas à être la plus voyante
              de l'écran. */}
          {!ticket.closedAt && (
            <Button variant="outline" size="sm" onClick={handleClose} disabled={isClosing}>
              <CheckCircle2 />
              {isClosing ? "Clôture…" : "Clore"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Statut ou priorité : la couleur définie dans les réglages, puis le nom. */
function AttributePill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
