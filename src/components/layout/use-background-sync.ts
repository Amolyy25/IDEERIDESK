"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerManualGmailSync } from "@/lib/actions/gmail-sync";
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
    toast.info(
      fresh.length === 1
        ? `${first.actor?.name ?? "Un agent"} vous a mentionné${
            first.ticket ? ` sur le ticket #${first.ticket.number}` : ""
          }`
        : `${fresh.length} nouvelles mentions`
    );
    return true;
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
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
            toast.info(`${result.appended} nouveau(x) message(s) reçu(s)`);
            shouldRefresh = true;
          }
        }
      } catch {
        // Relève silencieuse : une erreur ponctuelle ne doit pas interrompre
        // l'agent, le cycle suivant réessaiera seul.
      }

      try {
        if (await refreshNotifications({ announce: true })) {
          shouldRefresh = true;
        }
      } catch {
        // Idem : la cloche garde son contenu précédent.
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
