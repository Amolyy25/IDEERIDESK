"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CopyCheck, Loader2, Merge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/tickets/relative-time";
import { detectTicketDuplicates, dismissDuplicateSuggestion } from "@/lib/actions/ticket-merge";
import type { DuplicateSuggestion } from "@/lib/ticket-duplicates";
import { MergeDialog } from "@/components/tickets/ticket-detail/merge-dialog";

/** Ce que le dialogue de fusion doit savoir quand on accepte un rapprochement. */
type PendingMerge = {
  sourceId: string;
  sourceNumber: number;
  target: { id: string; number: number };
};

/**
 * « Ce ticket ressemble à un autre » — la moitié automatique de la fusion.
 *
 * La détection est lancée à l'ouverture de la fiche, pas au rendu serveur : une
 * page qui attend un modèle de langage avant de s'afficher est une page lente
 * pour tout le monde, y compris pour les tickets sans le moindre doublon (le cas
 * courant). La bannière apparaît donc quand elle a quelque chose à dire, et
 * l'agent lit son ticket pendant ce temps.
 *
 * Deux issues seulement, toutes deux définitives pour ce rapprochement :
 * fusionner, ou écarter. Sans le second, la même proposition reviendrait à
 * chaque ouverture jusqu'à ce qu'on cesse de la lire.
 */
export function DuplicateBanner({
  ticketId,
  ticketNumber,
  initialSuggestions,
}: {
  ticketId: string;
  ticketNumber: number;
  /** Rapprochements déjà en base, rendus côté serveur : la bannière est là d'emblée. */
  initialSuggestions: DuplicateSuggestion[];
}) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [isScanning, setIsScanning] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null);

  // Un seul passage par montage : sans ce verrou, le double rendu du mode
  // développement de React déclencherait deux détections — donc deux appels
  // facturés — pour une seule ouverture de fiche.
  const hasScanned = useRef(false);

  useEffect(() => {
    if (hasScanned.current) return;
    hasScanned.current = true;

    let cancelled = false;
    setIsScanning(true);

    detectTicketDuplicates(ticketId)
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result.suggestions);
      })
      // Silencieux : la détection de doublons est un service rendu en plus, pas
      // le travail de l'agent. Une clé API expirée ne doit pas lui jeter une
      // erreur au visage pendant qu'il lit une demande client.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function handleDismiss(suggestionId: string) {
    setDismissingId(suggestionId);
    try {
      await dismissDuplicateSuggestion(suggestionId);
      setSuggestions((current) => current.filter((item) => item.id !== suggestionId));
    } catch (error) {
      let message = "Impossible d'écarter la suggestion";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setDismissingId(null);
    }
  }

  function openMerge(suggestion: DuplicateSuggestion) {
    // Le sens vient du rapprochement, jamais de la fiche affichée : sur le
    // dossier de référence, c'est l'autre ticket qui vient s'y rattacher, et
    // c'est donc lui la source de la fusion.
    if (suggestion.incoming) {
      setPendingMerge({
        sourceId: suggestion.sourceId,
        sourceNumber: suggestion.other.number,
        target: { id: ticketId, number: ticketNumber },
      });
      return;
    }

    setPendingMerge({
      sourceId: suggestion.sourceId,
      sourceNumber: ticketNumber,
      target: { id: suggestion.other.id, number: suggestion.other.number },
    });
  }

  // Le témoin d'analyse en cours ne s'affiche pas tant qu'il n'y a rien à
  // montrer : une barre de chargement permanente en haut de chaque fiche ne
  // ferait qu'inquiéter, alors que la très grande majorité des tickets n'ont
  // aucun doublon.
  if (suggestions.length === 0) return null;

  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-6 pt-6">
        <div className="rounded-lg border border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2 border-b border-primary/20 px-4 py-2.5">
            <CopyCheck className="size-4 shrink-0 text-primary" />
            <p className="text-sm font-medium">{headline(suggestions.length)}</p>
            {isScanning && (
              <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <ul className="divide-y divide-primary/15">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/tickets/${suggestion.other.id}`}
                      className="font-mono text-xs text-muted-foreground tabular-nums hover:underline"
                    >
                      #{suggestion.other.number}
                    </Link>
                    <span className="text-sm font-medium">{suggestion.other.subject}</span>
                  </p>

                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{suggestion.other.statusName}</span>
                    {suggestion.other.clientName && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{suggestion.other.clientName}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <RelativeTime date={suggestion.other.createdAt} />
                    <span aria-hidden>·</span>
                    <span>{suggestion.score}% de similarité</span>
                  </p>

                  {/* Le motif du modèle, puis le sens de la fusion. Une
                      proposition sans justification n'est pas vérifiable, et une
                      justification sans direction ne dit pas quel dossier va se
                      refermer. */}
                  <p className="mt-1 text-xs text-muted-foreground italic">{suggestion.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {directionLabel(suggestion, ticketNumber)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" onClick={() => openMerge(suggestion)}>
                    <Merge />
                    Fusionner
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Écarter cette suggestion"
                    onClick={() => handleDismiss(suggestion.id)}
                    disabled={dismissingId === suggestion.id}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Le même dialogue que la fusion manuelle, ouvert sur la cible proposée :
          accepter une suggestion reste une décision confirmée, pas un clic qui
          referme un dossier client sans écran de contrôle. */}
      {pendingMerge && (
        <MergeDialog
          ticketId={pendingMerge.sourceId}
          ticketNumber={pendingMerge.sourceNumber}
          open
          onOpenChange={(open) => {
            if (open) return;
            setPendingMerge(null);
            router.refresh();
          }}
          initialTarget={pendingMerge.target}
        />
      )}
    </>
  );
}

function headline(count: number) {
  if (count === 1) return "Un ticket semble traiter la même demande";
  return `${count} tickets semblent traiter la même demande`;
}

/** Qui rejoint qui, écrit en toutes lettres sous chaque proposition. */
function directionLabel(suggestion: DuplicateSuggestion, ticketNumber: number) {
  if (suggestion.incoming) {
    return `Le ticket #${suggestion.other.number} serait rattaché à celui-ci, puis clos.`;
  }
  return `Le ticket #${ticketNumber} serait rattaché au #${suggestion.other.number}, puis clos.`;
}
