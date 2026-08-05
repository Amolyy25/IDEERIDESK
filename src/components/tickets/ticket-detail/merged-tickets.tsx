"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Merge, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { separateMergedTicket } from "@/lib/actions/ticket-merge";
import type { TicketWithMessages } from "@/lib/actions/tickets";

/**
 * Bandeau du ticket qui a, lui, été fusionné dans un autre.
 *
 * Il explique une chose et une seule : la conversation affichée en dessous n'est
 * pas celle de ce ticket seul, mais celle du dossier entier. Sans ce mot, un
 * agent arrivé par le doublon verrait deux colonnes sans savoir pourquoi la
 * demande d'un autre client s'affiche sur « son » ticket.
 *
 * Ce n'est plus une invitation à aller ailleurs : depuis cette page aussi, la
 * réponse part à tous les clients du dossier.
 */
export function MergedIntoBanner({
  mergedInto,
  ticketId,
  canMerge,
}: {
  mergedInto: NonNullable<TicketWithMessages["mergedInto"]>;
  ticketId: string;
  /** Défaire une fusion relève de « tickets.merge », comme la faire. */
  canMerge: boolean;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3">
        <Merge className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm">
          Ce ticket a été fusionné dans le{" "}
          <Link
            href={`/tickets/${mergedInto.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            ticket #{mergedInto.number}
          </Link>
          .{" "}
          <span className="text-muted-foreground">
            La conversation ci-dessous est celle du dossier complet, et votre réponse partira à
            tous ses clients.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {canMerge && <SeparateButton ticketId={ticketId} />}
          <Button asChild size="sm" variant="outline">
            <Link href={`/tickets/${mergedInto.id}`}>Ouvrir le #{mergedInto.number}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Annule une fusion. Le même bouton des deux côtés — bandeau du ticket rattaché,
 * en-tête de sa colonne dans le fil du ticket d'accueil : le geste est
 * identique, seul le point de vue change, et deux implémentations divergeraient
 * au premier ajustement.
 */
export function SeparateButton({
  ticketId,
  className,
}: {
  ticketId: string;
  className?: string;
}) {
  const router = useRouter();
  const [isSeparating, setIsSeparating] = useState(false);

  async function handleSeparate() {
    setIsSeparating(true);
    try {
      const result = await separateMergedTicket(ticketId);
      toast.success(`Ticket #${result.number} détaché du #${result.previousNumber}`);
      router.refresh();
    } catch (error) {
      let message = "Impossible de détacher ce ticket";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsSeparating(false);
    }
  }

  let label = "Détacher";
  if (isSeparating) {
    label = "Détachement…";
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={handleSeparate}
      disabled={isSeparating}
    >
      <Split />
      {label}
    </Button>
  );
}
