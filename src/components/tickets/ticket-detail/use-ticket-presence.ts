"use client";

import { useEffect, useState } from "react";
import {
  clearTicketPresence,
  heartbeatTicketPresence,
  type TicketPresenceItem,
} from "@/lib/actions/ticket-presence";
import { isStaleDeployment, noticeStaleDeployment } from "@/lib/stale-deployment";

/**
 * Cadence des battements.
 *
 * Quinze secondes, à tenir avec l'expiration côté serveur (trois battements) : le
 * compromis est entre la vitesse à laquelle on apprend qu'un collègue s'est mis à
 * rédiger et le nombre de requêtes qu'un onglet laissé ouvert produit dans la
 * journée. La transition « je commence à rédiger » ne l'attend pas : elle
 * déclenche un battement immédiat, parce que c'est le moment précis où le collègue
 * doit être averti.
 */
const BEAT_MS = 15_000;

/**
 * Qui d'autre est sur cette fiche.
 *
 * Deux effets et non un seul, parce que les deux ne se déclenchent pas sur les
 * mêmes changements :
 *
 * — le premier bat, et se rejoue quand `composing` bascule : c'est ce qui envoie
 *   l'information tout de suite au lieu d'attendre le prochain tour ;
 * — le second ne dépend que du ticket, et ne fait que retirer la présence en
 *   partant. Le mêler au premier ferait effacer puis réinscrire la présence à
 *   chaque fois que l'agent vide ou remplit son champ.
 *
 * Rien n'est signalé à l'agent en cas d'échec : une présence est une commodité,
 * pas une donnée de travail. Un réseau qui hoquette ne doit pas produire un
 * message d'erreur au-dessus d'un brouillon en cours.
 */
export function useTicketPresence({
  ticketId,
  composing,
}: {
  ticketId: string;
  /** Le champ de réponse de l'agent n'est pas vide. */
  composing: boolean;
}): TicketPresenceItem[] {
  const [others, setOthers] = useState<TicketPresenceItem[]>([]);

  useEffect(() => {
    let stopped = false;
    // Déclaré avant `beat`, et non par le `const` qui le crée : le premier
    // battement part immédiatement, donc AVANT cette création. Une référence à
    // une liaison `const` pas encore initialisée lèverait dès ce premier appel.
    let interval: ReturnType<typeof setInterval> | null = null;

    async function beat() {
      // Onglet en arrière-plan : ni battement, ni lecture. Sans cette garde, un
      // agent qui laisse dix fiches ouvertes dans dix onglets apparaîtrait
      // présent sur dix dossiers à la fois — et le serait, techniquement, ce qui
      // rend l'indicateur inutile.
      if (document.visibilityState === "hidden") return;

      // Onglet resté sur une version qui n'est plus déployée : plus rien
      // n'aboutira, et battre quatre fois par minute pour rien ne fait que
      // remplir les logs de la plateforme.
      if (isStaleDeployment()) {
        if (interval) clearInterval(interval);
        return;
      }

      try {
        const present = await heartbeatTicketPresence({ ticketId, composing });
        if (!stopped) setOthers(present);
      } catch (error) {
        // Silencieux : le battement suivant réessaiera seul.
        noticeStaleDeployment(error);
      }
    }

    beat();
    interval = setInterval(beat, BEAT_MS);

    // Retour sur l'onglet : on se réannonce sans attendre le prochain tour, sinon
    // l'agent reste invisible de ses collègues pendant quinze secondes alors qu'il
    // est en train de lire le dossier.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ticketId, composing]);

  useEffect(() => {
    return () => {
      // Sans `await` : on quitte la page, il n'y a plus personne pour attendre le
      // résultat. L'expiration côté serveur couvre le cas où l'appel n'aboutit
      // pas.
      void clearTicketPresence(ticketId).catch(() => {});
    };
  }, [ticketId]);

  return others;
}
