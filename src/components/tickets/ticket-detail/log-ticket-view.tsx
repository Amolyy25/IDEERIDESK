"use client";

import { useEffect } from "react";
import { logTicketConsultation } from "@/lib/actions/tickets";

/**
 * Inscrit au journal d'audit l'ouverture de cette fiche par l'agent connecté.
 *
 * Monté côté client, exactement comme `MarkAsRead` et pour la même raison : les
 * `<Link>` de Next préchargent les routes au survol, ce qui rend le composant
 * serveur de la fiche sans qu'aucun agent ne l'ait ouverte. Journaliser depuis la
 * page inscrirait donc des consultations qui n'ont pas eu lieu — et un journal
 * d'audit qui affirme faux est pire qu'un journal absent.
 *
 * Le dédoublonnage (ne pas réinscrire la même consultation à chaque
 * rechargement) est côté serveur, dans `recordTicketView` : c'est le seul endroit
 * qui voit l'historique.
 */
export function LogTicketView({ ticketId }: { ticketId: string }) {
  useEffect(() => {
    // Sans `await` ni gestion d'erreur affichée : une trace perdue ne doit pas
    // interrompre la lecture du ticket (l'action est déjà silencieuse côté
    // serveur, ce `catch` ne couvre que la coupure réseau).
    logTicketConsultation(ticketId).catch(() => {});
  }, [ticketId]);

  return null;
}
