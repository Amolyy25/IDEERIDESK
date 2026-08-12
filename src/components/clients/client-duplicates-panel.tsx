"use client";

import { useMemo, useState } from "react";
import { Merge, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DUPLICATE_REASON_LABELS,
  findClientDuplicateGroups,
} from "@/lib/client-duplicates";
import { MergeClientsDialog } from "@/components/clients/merge-clients-dialog";
import { plural } from "@/lib/utils";
import type { ClientWithTicketCount } from "@/components/clients/clients-table";

/**
 * Les rapprochements que la détection propose, au-dessus du répertoire.
 *
 * Rendu côté client et calculé à partir de la liste que la page a déjà chargée :
 * la détection est une fonction pure (voir `client-duplicates.ts`), une requête
 * de plus n'apprendrait rien. Le panneau disparaît complètement quand il n'y a
 * rien à proposer — un bandeau « aucun doublon » occuperait chaque jour la place
 * de ce qu'on vient lire.
 *
 * Le panneau PROPOSE, il ne décide pas : deux personnes peuvent porter le même
 * nom, et c'est le motif du rapprochement qui permet à l'agent de le savoir
 * avant d'ouvrir la fenêtre. D'où le libellé du motif sur chaque ligne, plutôt
 * qu'un score ou une simple alerte.
 */
export function ClientDuplicatesPanel({ clients }: { clients: ClientWithTicketCount[] }) {
  // Mémorisé sur la liste et non recalculé à chaque rendu : ouvrir puis fermer
  // la fenêtre de fusion rend ce composant, et la détection parcourt tout le
  // répertoire.
  const groups = useMemo(() => findClientDuplicateGroups(clients), [clients]);
  /** Fiches de la fusion en cours, `null` quand la fenêtre est fermée. */
  const [merging, setMerging] = useState<string[] | null>(null);

  if (groups.length === 0) return null;

  return (
    <section className="rounded-lg border">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Users className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">
          {groups.length} rapprochement{plural(groups.length)} possible{plural(groups.length)}
        </h2>
        <p className="text-xs text-muted-foreground">
          Des fiches qui semblent désigner la même personne.
        </p>
      </header>

      <ul className="divide-y">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {group.reasons.map((reason) => (
                  <Badge key={reason} variant={reason === "EMAIL" ? "secondary" : "outline"}>
                    {DUPLICATE_REASON_LABELS[reason]}
                  </Badge>
                ))}
              </div>
              <ul className="text-sm">
                {group.members.map((member) => (
                  <li key={member.id} className="truncate text-muted-foreground">
                    <span className="text-foreground">{member.name}</span> — {member.email}
                    {member._count.tickets > 0 && (
                      <span className="text-xs">
                        {" "}
                        · {member._count.tickets} ticket{plural(member._count.tickets)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setMerging(group.members.map((member) => member.id))}
            >
              <Merge className="size-4" />
              Examiner
            </Button>
          </li>
        ))}
      </ul>

      {/* La `key` remonte les valeurs par défaut de la fenêtre à chaque
          rapprochement examiné : un nouveau lot de fiches est un nouveau
          composant, sans rien à réinitialiser à la main. */}
      {merging !== null && (
        <MergeClientsDialog
          key={merging.join("|")}
          open
          onOpenChange={(open) => {
            if (!open) setMerging(null);
          }}
          initialIds={merging}
          clients={clients}
        />
      )}
    </section>
  );
}
