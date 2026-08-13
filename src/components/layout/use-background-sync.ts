"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerManualGmailSync } from "@/lib/actions/gmail-sync";
import { isStaleDeployment, noticeStaleDeployment } from "@/lib/stale-deployment";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/actions/notifications";

/**
 * Cadence unique de l'arrière-plan du dashboard.
 *
 * Il n'y a pas de canal temps réel dans ce projet (Gmail push demande un topic
 * Pub/Sub non provisionné, et rien ne pousse les mentions côté client) : ce
 * cycle est le seul moyen pour qu'une réponse client ou un ping arrive à un
 * agent qui ne navigue pas. Un seul intervalle pour les deux, plutôt que deux
 * horloges décalées qui doublent les requêtes par onglet ouvert.
 */
const SYNC_INTERVAL_MS = 60_000;

/**
 * Relève de fond du dashboard : réception des emails et des mentions @, plus
 * l'état de la cloche de notifications.
 *
 * Monté une seule fois, dans la barre latérale — elle est présente sur toutes
 * les pages de l'espace agent, y compris quand Gmail n'est pas connecté (seule
 * la moitié « emails » du cycle est alors sautée).
 */
export function useBackgroundSync({
  gmailConnected,
  initialItems,
  initialUnreadCount,
}: {
  gmailConnected: boolean;
  initialItems: NotificationItem[];
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const isRunningRef = useRef(false);
  // Notifications déjà annoncées par un toast — sinon chaque cycle
  // re-signalerait les mêmes mentions non lues.
  const announcedIds = useRef(new Set(initialItems.map((item) => item.id)));

  /** Relit les notifications et signale les mentions jamais annoncées. */
  const refreshNotifications = useCallback(async ({ announce }: { announce: boolean }) => {
    const result = await getMyNotifications();
    setItems(result.items);
    setUnreadCount(result.unreadCount);

    const fresh = result.items.filter(
      (item) => !item.readAt && !announcedIds.current.has(item.id)
    );
    for (const item of result.items) announcedIds.current.add(item.id);

    if (!announce || fresh.length === 0) return false;

    const [first] = fresh;
    const actorName = first.actor?.name ?? "Un agent";
    const onTicket = first.ticket ? ` · ticket #${first.ticket.number}` : "";
    toast.info(
      fresh.length === 1
        ? first.type === "ASSIGNMENT"
          ? `${actorName} vous a assigné un ticket${onTicket}`
          : `${actorName} vous a mentionné${onTicket}`
        : `${fresh.length} nouvelles notifications`
    );
    return true;
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Onglet resté sur une version qui n'est plus déployée : ses appels ne
      // peuvent plus aboutir. Ce cycle-ci était la principale source du « Failed
      // to find Server Action » qui remplissait les logs — deux actions, une
      // relance par minute, indéfiniment, sur chaque onglet laissé ouvert.
      if (isStaleDeployment()) {
        clearInterval(interval);
        return;
      }

      // Un cycle lent (envoi Gmail en cours) ne doit pas se superposer au
      // suivant : le tour est sauté, pas mis en file.
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      // Un seul `router.refresh()` pour les deux volets : c'est un aller-retour
      // serveur complet, le déclencher deux fois de suite ne sert à rien.
      let shouldRefresh = false;

      try {
        if (gmailConnected) {
          const result = await triggerManualGmailSync();
          if (result.connected && result.appended > 0) {
            let message = `${result.appended} nouveau(x) message(s) reçu(s)`;
            if (result.reopened > 0) {
              message += ` · ${result.reopened} ticket(s) réouvert(s)`;
            }
            toast.info(message);
            shouldRefresh = true;
          }
          // Emails entrants transformés en tickets (réglage activable dans
          // /settings/email) : signalés à part des réponses, c'est du travail
          // qui entre dans la file, pas un fil qui avance.
          if (result.connected && result.created > 0) {
            toast.info(`${result.created} nouveau(x) ticket(s) créé(s) par email`);
            shouldRefresh = true;
          }
          // Relance d'un client connu qui ne s'est rattachée à aucun ticket :
          // le message existe côté Gmail mais n'entrera jamais dans un fil,
          // quelqu'un doit aller le chercher dans la boîte.
          if (result.connected && result.orphaned > 0) {
            toast.warning(
              `${result.orphaned} email(s) de client(s) sans ticket correspondant — à traiter dans la boîte support.`
            );
          }
        }
      } catch (error) {
        // Relève silencieuse : une erreur ponctuelle ne doit pas interrompre
        // l'agent, le cycle suivant réessaiera seul. Sauf s'il n'y a plus de
        // cycle suivant qui vaille — voir `noticeStaleDeployment`.
        noticeStaleDeployment(error);
      }

      try {
        if (await refreshNotifications({ announce: true })) {
          shouldRefresh = true;
        }
      } catch (error) {
        // Idem : la cloche garde son contenu précédent.
        noticeStaleDeployment(error);
      }

      isRunningRef.current = false;
      if (shouldRefresh) router.refresh();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [gmailConnected, refreshNotifications, router]);

  /** Ouverture de la cloche : son contenu peut venir d'un rendu vieux de plusieurs minutes. */
  const refreshOnDemand = useCallback(async () => {
    try {
      await refreshNotifications({ announce: false });
    } catch {
      // La liste déjà affichée reste utilisable.
    }
  }, [refreshNotifications]);

  const markRead = useCallback(async (id: string) => {
    setItems((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, readAt: new Date() } : entry))
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationsRead([id]);
    } catch {
      // L'état se corrige au prochain cycle ; la navigation reste prioritaire.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date();
    setItems((current) => current.map((entry) => (entry.readAt ? entry : { ...entry, readAt: now })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // Idem.
    }
  }, []);

  return { items, unreadCount, refreshOnDemand, markRead, markAllRead };
}
