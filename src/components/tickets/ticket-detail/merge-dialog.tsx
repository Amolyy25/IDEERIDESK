"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Merge, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/tickets/relative-time";
import { mergeTicketInto, searchTicketsToMergeInto } from "@/lib/actions/ticket-merge";
import type { MergeSearchResult } from "@/lib/actions/ticket-merge";
import type { MergeOutcome } from "@/lib/ticket-merge";
import { cn, plural } from "@/lib/utils";

/** Frappe avalée avant d'interroger le serveur : une recherche par lettre serait du gaspillage. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Fusion manuelle : « ce ticket fait doublon avec celui-là ».
 *
 * Le sens du geste est fixé et annoncé sans détour — le ticket ouvert rejoint
 * celui qu'on désigne, et c'est le second qui devient le dossier de travail. Une
 * fusion qui laisse un doute sur la direction est une fusion qu'on défait.
 *
 * Rien n'est perdu à la fusion (voir `ticket-merge.ts`), et c'est dit dans le
 * dialogue : sans cette assurance, l'agent hésite et laisse le doublon en file.
 */
export function MergeDialog({
  ticketId,
  ticketNumber,
  open,
  onOpenChange,
  /** Pré-sélection venue d'une suggestion acceptée : identifiant et numéro de la cible. */
  initialTarget = null,
}: {
  ticketId: string;
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTarget?: { id: string; number: number } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Le contenu n'est monté qu'à l'ouverture : recherche et sélection
          partent ainsi de la cible proposée, sans avoir à recopier des props
          dans l'état à chaque ouverture. Une fermeture remet tout à zéro, ce
          qui est le comportement attendu — la sélection de la fois précédente
          n'a aucune raison de survivre. */}
      {open && (
        <MergeDialogBody
          ticketId={ticketId}
          ticketNumber={ticketNumber}
          initialTarget={initialTarget}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function MergeDialogBody({
  ticketId,
  ticketNumber,
  initialTarget,
  onOpenChange,
}: {
  ticketId: string;
  ticketNumber: number;
  initialTarget: { id: string; number: number } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // Ouverture depuis une suggestion : la recherche est amorcée sur le numéro
  // proposé, sans quoi la cible pré-sélectionnée pourrait ne pas figurer dans la
  // liste — un bouton « Fusionner » actif au-dessus d'une liste où rien n'est
  // coché est exactement ce qui fait douter du sens de la fusion.
  const [search, setSearch] = useState(() => initialSearchTerm(initialTarget));
  const [results, setResults] = useState<MergeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialTarget?.id ?? null);
  const [isMerging, setIsMerging] = useState(false);

  const runSearch = useCallback(
    async (term: string) => {
      setIsSearching(true);
      try {
        setResults(await searchTicketsToMergeInto(ticketId, term));
      } catch (error) {
        let message = "Recherche impossible";
        if (error instanceof Error) {
          message = error.message;
        }
        toast.error(message);
      } finally {
        setIsSearching(false);
      }
    },
    [ticketId]
  );

  // Le dialogue s'ouvre déjà rempli des tickets les plus récents : dans la
  // plupart des cas le doublon est là, sans rien avoir à taper. Le tout premier
  // chargement part donc sans délai ; seule la frappe de l'agent est amortie.
  useEffect(() => {
    let delay = SEARCH_DEBOUNCE_MS;
    if (search === "") {
      delay = 0;
    }

    const timer = setTimeout(() => runSearch(search), delay);
    return () => clearTimeout(timer);
  }, [search, runSearch]);

  async function handleMerge() {
    if (!selectedId || isMerging) return;

    setIsMerging(true);
    try {
      const outcome = await mergeTicketInto({ sourceId: ticketId, targetId: selectedId });
      toast.success(mergeSuccessMessage(outcome));
      onOpenChange(false);
      // Vers le ticket de destination : c'est là que le travail continue, y
      // rester après la fusion évite d'avoir à le retrouver.
      router.push(`/tickets/${outcome.targetId}`);
      router.refresh();
    } catch (error) {
      let message = "Fusion impossible";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fusionner le ticket #{ticketNumber}</DialogTitle>
          <DialogDescription>
            Choisissez le ticket qui traite déjà cette demande. Le #{ticketNumber} y sera rattaché
            puis clos, et les réponses écrites sur le ticket retenu partiront aussi à son client.
            Rien n&apos;est supprimé : la fusion peut être annulée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Numéro, sujet, client…"
              className="pl-9"
            />
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {isSearching && results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Recherche…</p>
            )}

            {!isSearching && results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun ticket ne correspond.
              </p>
            )}

            <ul className="divide-y">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(result.id)}
                    aria-pressed={selectedId === result.id}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:-outline-offset-2",
                      selectedId === result.id && "bg-primary/10 hover:bg-primary/10"
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        #{result.number}
                      </span>
                      <span className="truncate text-sm font-medium">{result.subject}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{result.statusName}</span>
                      {result.clientName && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{result.clientName}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <RelativeTime date={result.createdAt} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Fusionner dans un ticket clos rouvre rarement ce que l'agent
              imagine : la demande y sera rattachée sans que personne ne la
              reprenne. Signalé au moment du choix, pas après. */}
          {selectedId !== null && results.find((r) => r.id === selectedId)?.isClosed && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Ce ticket est clos : la demande y sera rattachée, mais elle ne remontera pas dans les
              files tant qu&apos;il ne sera pas rouvert.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Annuler
          </Button>
          <Button onClick={handleMerge} disabled={!selectedId || isMerging}>
            <MergeButtonContent isMerging={isMerging} />
          </Button>
        </div>
      </DialogContent>
    </>
  );
}

function MergeButtonContent({ isMerging }: { isMerging: boolean }) {
  if (isMerging) {
    return (
      <>
        <Loader2 className="animate-spin" />
        Fusion…
      </>
    );
  }

  return (
    <>
      <Merge />
      Fusionner
    </>
  );
}

/**
 * Terme de recherche au moment de l'ouverture.
 *
 * Ouvert depuis une suggestion, le dialogue cherche directement le numéro
 * proposé : sans ça, la cible pré-sélectionnée pourrait ne pas figurer dans la
 * liste des tickets récents, et le bouton « Fusionner » serait actif au-dessus
 * d'une liste où rien n'apparaît coché.
 */
function initialSearchTerm(initialTarget: { id: string; number: number } | null) {
  if (!initialTarget) return "";
  return `#${initialTarget.number}`;
}

/** « #45 fusionné dans le #12 », et le report éventuel des doublons du #45. */
function mergeSuccessMessage(outcome: MergeOutcome) {
  const base = `Ticket #${outcome.sourceNumber} fusionné dans le #${outcome.targetNumber}`;
  if (outcome.reattachedCount === 0) return base;

  const count = outcome.reattachedCount;
  return `${base} · ${count} doublon${plural(count)} rattaché${plural(count)}`;
}
