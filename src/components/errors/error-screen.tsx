"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { identifyError, type KnownError } from "@/lib/error-catalog";
import { DiagnosticChain } from "./diagnostic-chain";

type Props = {
  error: Error & { digest?: string };
  /** Rejoue le rendu du segment, sans recharger la page (API de Next). */
  reset: () => void;
};

// Forme de ticket, devant des agents qui en trient toute la journée : bandeau
// d'état, corps, talon détachable. Le talon porte la référence — c'est la partie
// qu'on arrache et qu'on transmet. Mono pour la machine, Inter pour l'humain.
export function ErrorScreen({ error, reset }: Props) {
  const known = identifyError(error);

  // La référence utile est le `digest` en production, le message en développement
  // — c'est le seul des deux qui existe à la fois.
  const reference = error.digest ?? error.message;

  return (
    <div className="ticket-stock flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-2xl rounded-xl border bg-card shadow-lg shadow-black/[0.03] duration-500">
        <StatusBar known={known} />

        <div className="space-y-8 p-8 sm:p-10">
          <header className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards space-y-3 delay-75 duration-500">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {known.title}
            </h1>
            <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
              {known.cause}
            </p>
          </header>

          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards delay-150 duration-500">
            <DiagnosticChain failsAt={known.failsAt} />
          </div>

          <section className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards space-y-3 delay-200 duration-500">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              À faire
            </h2>
            <ul className="space-y-2.5">
              {known.actions.map((action) => (
                <li key={action} className="flex gap-3 text-[15px] leading-relaxed">
                  <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-border" />
                  {action}
                </li>
              ))}
            </ul>
          </section>

          <div className="animate-in fade-in fill-mode-backwards flex flex-wrap items-center gap-2 delay-300 duration-500">
            {known.canReload ? (
              <Button type="button" onClick={() => window.location.reload()}>
                Recharger la page
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={reset}>
              Réessayer
            </Button>
            <Button asChild variant="ghost" className="text-muted-foreground">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </div>

        {reference ? <Stub reference={reference} /> : null}
      </div>
    </div>
  );
}

function StatusBar({ known }: { known: KnownError }) {
  return (
    <div className="flex items-center gap-3 rounded-t-xl border-b bg-muted/40 py-3 pr-5 pl-4">
      <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full bg-destructive" />
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Incident système
        <span className="mx-2 text-border">/</span>
        <span className="text-foreground">{known.domain}</span>
      </p>
      <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
        {known.canReload ? "Peut se rétablir" : "Intervention requise"}
      </span>
    </div>
  );
}

// Les pastilles mordent la bordure : opaques et de la couleur du fond de page,
// elles couvrent le trait vertical et referment leur propre arc. Elles débordent,
// d'où l'absence d'`overflow-hidden` — les angles sont arrondis segment par segment.
function Stub({ reference }: { reference: string }) {
  function copy() {
    navigator.clipboard.writeText(reference);
    toast.success("Référence copiée");
  }

  return (
    <div className="relative flex items-center gap-4 rounded-b-xl border-t border-dashed bg-muted/40 py-3 pr-2.5 pl-5">
      <span
        aria-hidden
        className="absolute -top-[9px] -left-[9px] h-[18px] w-[18px] rounded-full border bg-muted/30"
      />
      <span
        aria-hidden
        className="absolute -top-[9px] -right-[9px] h-[18px] w-[18px] rounded-full border bg-muted/30"
      />

      <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Référence
      </span>
      <code className="truncate font-mono text-xs text-foreground/70" title={reference}>
        {reference}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="ml-auto shrink-0 text-muted-foreground"
        onClick={copy}
      >
        <Copy />
        Copier
      </Button>
    </div>
  );
}
