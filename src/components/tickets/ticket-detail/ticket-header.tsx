"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BellOff,
  BookPlus,
  CheckCircle2,
  ChevronDown,
  Lock,
  Merge,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SourceBadge } from "@/components/tickets/source-badge";
import { formatDateTime } from "@/lib/format-date";
import { claimTicket, closeTicket } from "@/lib/actions/tickets";
import type { TicketWithMessages } from "@/lib/actions/tickets";
import { MergeDialog } from "@/components/tickets/ticket-detail/merge-dialog";
import { plural } from "@/lib/utils";

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
  canRespond,
  canMerge: hasMergePermission,
  canWriteArticle,
}: {
  ticket: TicketWithMessages;
  currentAgentId: string | null;
  canRespond: boolean;
  /** Permission « tickets.merge », distincte de « répondre et modifier ». */
  canMerge: boolean;
  /** Permission « kb.manage » : le fil peut devenir un article. */
  canWriteArticle: boolean;
}) {
  const router = useRouter();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  // « Prendre en charge » et « Clore » écrivent sur le ticket : un compte en
  // lecture seule voyait jusqu'ici deux boutons que le serveur refusait.
  const canClaim = canRespond && Boolean(currentAgentId) && ticket.assigneeId !== currentAgentId;
  // Un ticket déjà fusionné n'a rien à fusionner de plus : c'est depuis sa
  // destination que l'équipe travaille, le proposer ici mènerait à des chaînes
  // que personne ne relit.
  const canMerge = hasMergePermission && ticket.mergedIntoId === null;

  async function handleClaim() {
    setIsClaiming(true);
    try {
      await claimTicket(ticket.id);
      toast.success("Ticket pris en charge");
      router.refresh();
    } catch (error) {
      let message = "Impossible de prendre en charge";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleClose(silent = false) {
    setIsClosing(true);
    try {
      const result = await closeTicket(ticket.id, { silent });
      toast.success(closeMessage(result));
      router.refresh();
    } catch (error) {
      let message = "Impossible de clore ce ticket";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
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
          {/* Le lien qui ferme la boucle du support : ce fil vient d'être
              résolu, et la prochaine personne qui posera la même question
              mérite mieux qu'un second ticket. Il mène au formulaire d'article,
              où le fil est proposé comme source — il ne rédige rien tout seul. */}
          {canWriteArticle && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/knowledge-base/new?ticket=${ticket.id}`}>
                <BookPlus />
                Créer un article
              </Link>
            </Button>
          )}
          {/* Fusionner et clore sont toutes deux en retrait : ce sont les
              actions qui retirent un dossier de la file, elles n'ont pas à être
              les plus voyantes de l'écran. */}
          {canMerge && (
            <Button variant="outline" size="sm" onClick={() => setIsMergeOpen(true)}>
              <Merge />
              Fusionner
            </Button>
          )}
          {/* Bouton scindé : le geste courant reste à un clic, la variante vit
              dans le menu. L'inverse — un menu pour les deux — aurait fait payer
              un clic supplémentaire à la clôture normale, qui est la règle, pour
              rendre accessible l'exception. */}
          {canRespond && !ticket.closedAt && (
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                className="rounded-r-none"
                onClick={() => handleClose()}
                disabled={isClosing}
              >
                <CheckCircle2 />
                {isClosing ? "Clôture…" : "Clore"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    // `-ml-px` : les deux bordures se superposent au lieu de
                    // former un trait deux fois plus épais entre les moitiés.
                    className="-ml-px rounded-l-none px-2"
                    disabled={isClosing}
                    aria-label="Autres façons de clore ce ticket"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuItem
                    className="items-start gap-2 py-2"
                    onSelect={() => handleClose(true)}
                  >
                    <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="space-y-0.5">
                      <span className="block font-medium">Clore sans prévenir le client</span>
                      {/* Dit en entier : c'est la seule chose qui distingue les
                          deux gestes, et elle est invisible une fois faite. */}
                      <span className="block text-xs leading-snug text-muted-foreground">
                        Aucun email de clôture ne part, ni au client, ni à ceux des tickets
                        fusionnés. Pour un doublon, un test, ou une demande déjà réglée de vive
                        voix. La clôture reste inscrite au journal d&apos;audit et dans le fil.
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {canMerge && (
        <MergeDialog
          ticketId={ticket.id}
          ticketNumber={ticket.number}
          open={isMergeOpen}
          onOpenChange={setIsMergeOpen}
        />
      )}
    </header>
  );
}

/**
 * Ce que la clôture a réellement provoqué.
 *
 * Le nombre de clients servis est dit explicitement : après une fusion, l'email
 * de clôture part aussi aux clients des doublons, et « email envoyé au client »
 * laisserait croire qu'un seul l'a reçu.
 */
function closeMessage(result: { emailSent: boolean; alsoSentTo: number; silent: boolean }) {
  // En premier : quand rien n'est parti, c'est CE fait qu'il faut confirmer. Un
  // simple « Ticket clos » laisserait douter de ce que le client a reçu.
  if (result.silent) return "Ticket clos sans prévenir le client";

  const extra = result.alsoSentTo;

  if (result.emailSent && extra === 0) return "Ticket clos, email envoyé au client";
  if (result.emailSent) {
    return `Ticket clos, email envoyé au client (+ ${extra} client${plural(
      extra
    )} de ticket${plural(extra)} fusionné${plural(extra)})`;
  }
  if (extra > 0) {
    return `Ticket clos, email envoyé à ${extra} client${plural(extra)} de ticket${plural(
      extra
    )} fusionné${plural(extra)}`;
  }
  return "Ticket clos";
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
