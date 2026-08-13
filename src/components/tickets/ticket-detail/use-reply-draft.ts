"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Sauvegarde automatique du brouillon de réponse, dans le navigateur.
 *
 * Le problème : une réponse en cours de rédaction ne vit que dans l'état d'un
 * composant. Ouvrir le dossier client dans le même onglet, cliquer une
 * notification, recharger la page après un déploiement, fermer par erreur —
 * n'importe lequel de ces gestes effaçait dix minutes d'écriture, sans le
 * moindre avertissement. C'est le seul endroit de l'application où un travail
 * non enregistré peut disparaître d'un clic.
 *
 * Pourquoi le stockage local et pas la base : le brouillon doit survivre à une
 * navigation, pas voyager d'un poste à l'autre. Une colonne en base imposerait
 * un aller-retour serveur à chaque frappe (ou un débounce qui perdrait quand
 * même les dernières secondes en cas de fermeture), une écriture par agent et
 * par ticket, et une politique d'expiration — pour un besoin que le navigateur
 * couvre déjà, hors ligne compris. En contrepartie, un brouillon commencé sur un
 * poste ne se retrouve pas sur un autre : c'est annoncé sous le champ.
 *
 * La clé porte l'identifiant de l'AGENT autant que celui du ticket : sur un
 * poste partagé, la réponse à moitié écrite par un collègue ne doit pas
 * réapparaître sous le nom de la personne suivante.
 *
 * Deux crochets, et cette séparation est le cœur du fichier : la LECTURE est un
 * instantané pris une fois à l'ouverture, l'ÉCRITURE est continue. Les mélanger
 * obligeait à restaurer depuis un effet, c'est-à-dire à écraser d'un rendu à
 * l'autre ce que l'agent venait de taper.
 */

const STORAGE_PREFIX = "ideeridesk.reply-draft.v1";

/** Le temps de frappe d'un mot : assez court pour ne rien perdre, assez long
 *  pour ne pas écrire dans le stockage à chaque caractère. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * Au-delà, le brouillon est jeté sans être proposé.
 *
 * Un texte écrit il y a une semaine pour un ticket qui a vécu depuis n'est plus
 * une aide : le ressortir tel quel ferait envoyer au client une réponse fondée
 * sur un état du dossier qui n'existe plus. C'est aussi ce qui empêche le
 * stockage du navigateur de grossir indéfiniment, ticket après ticket.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ReplyDraft = {
  /** Réponse publique, en HTML d'éditeur. */
  html: string;
  /** Note interne, en texte brut — les deux modes ont leur propre brouillon. */
  note: string;
  /** Mode ouvert au moment de l'enregistrement, restauré avec le texte. */
  isPrivate: boolean;
  /** Horodatage en millisecondes, affiché sous le champ. */
  savedAt: number;
};

function storageKey(ticketId: string, agentId: string) {
  return `${STORAGE_PREFIX}:${agentId}:${ticketId}`;
}

/**
 * Toutes les lectures et écritures passent par ici : le stockage local lève en
 * navigation privée sur certains navigateurs, et quand le quota est atteint.
 * Un brouillon qu'on ne peut pas écrire est un confort perdu, jamais une raison
 * d'empêcher l'agent de répondre.
 */
function safely<T>(action: () => T): T | null {
  try {
    return action();
  } catch {
    return null;
  }
}

function readDraft(key: string): ReplyDraft | null {
  return safely(() => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ReplyDraft>;
    if (typeof parsed?.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }

    const draft: ReplyDraft = {
      html: typeof parsed.html === "string" ? parsed.html : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
      isPrivate: parsed.isPrivate === true,
      savedAt: parsed.savedAt,
    };

    // Un brouillon vide dans les deux modes n'a rien à restaurer : le proposer
    // afficherait la mention « brouillon retrouvé » sur un champ vierge.
    if (!draft.html.trim() && !draft.note.trim()) return null;
    return draft;
  });
}

/**
 * Purge les brouillons périmés de TOUS les tickets, à l'ouverture de n'importe
 * lequel. Sans ce passage, un brouillon sur un ticket qu'on ne rouvre jamais
 * resterait indéfiniment dans le navigateur : il n'y a pas d'autre moment où on
 * repasse devant.
 */
function purgeExpiredDrafts() {
  safely(() => {
    const now = Date.now();
    const expired: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(`${STORAGE_PREFIX}:`)) continue;

      const raw = window.localStorage.getItem(key);
      let savedAt: unknown = null;
      try {
        savedAt = (JSON.parse(raw ?? "") as Partial<ReplyDraft>)?.savedAt;
      } catch {
        // Entrée illisible : elle ne redeviendra pas lisible, elle part avec les
        // périmées.
      }
      if (typeof savedAt !== "number" || now - savedAt > MAX_AGE_MS) expired.push(key);
    }

    // Suppression après le parcours : retirer une clé pendant l'itération décale
    // les index et fait sauter une entrée sur deux.
    expired.forEach((key) => window.localStorage.removeItem(key));
  });
}

/**
 * Instantané du brouillon, figé pour toute la durée d'affichage du ticket.
 *
 * `useSyncExternalStore` exige que `getSnapshot` renvoie la MÊME valeur tant que
 * la source n'a pas changé : relire et reparser le stockage à chaque rendu
 * rendrait un objet neuf à chaque fois, et React bouclerait. D'où ce cache.
 *
 * Il ne s'invalide volontairement pas sur nos propres écritures. Ce que ce
 * crochet répond n'est pas « que contient le stockage maintenant » mais « qu'y
 * avait-il en arrivant sur ce ticket » — la seule question qui compte, puisque
 * la réponse sert à AMORCER les champs. Une valeur qui changerait en cours de
 * frappe replacerait le composant sur un contenu déjà dépassé.
 *
 * L'entrée est retirée au démontage (voir `subscribe`) : revenir sur le ticket
 * plus tard doit relire le stockage, pas resservir l'instantané de la visite
 * précédente.
 */
const snapshots = new Map<string, ReplyDraft | null>();

const keyListeners = new Map<string, Set<() => void>>();

function subscribe(key: string, onChange: () => void) {
  let listeners = keyListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    keyListeners.set(key, listeners);
  }
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0) return;
    keyListeners.delete(key);
    snapshots.delete(key);
  };
}

function getSnapshot(key: string): ReplyDraft | null {
  if (!snapshots.has(key)) {
    purgeExpiredDrafts();
    snapshots.set(key, readDraft(key));
  }
  return snapshots.get(key) ?? null;
}

/**
 * `undefined` côté serveur ET au premier rendu du navigateur : les deux doivent
 * produire le même balisage, or le serveur n'a pas accès au stockage local.
 * React relit l'instantané juste après l'hydratation et rend une seconde fois
 * avec le brouillon — c'est ce passage de `undefined` à une valeur qui permet à
 * l'appelant d'amorcer ses champs par une simple clé de remontage, sans jamais
 * écraser en cours de route ce que l'agent est en train d'écrire.
 */
function getServerSnapshot(): ReplyDraft | null | undefined {
  return undefined;
}

export function useStoredReplyDraft({
  ticketId,
  agentId,
}: {
  ticketId: string;
  agentId: string;
}): ReplyDraft | null | undefined {
  const key = storageKey(ticketId, agentId);

  const subscribeToKey = useCallback((onChange: () => void) => subscribe(key, onChange), [key]);
  const snapshotForKey = useCallback(() => getSnapshot(key), [key]);

  return useSyncExternalStore(subscribeToKey, snapshotForKey, getServerSnapshot);
}

/**
 * Le versant écriture : enregistre au repos de frappe, et dit quand il l'a fait.
 */
export function useReplyDraftWriter({
  ticketId,
  agentId,
  initialSavedAt,
}: {
  ticketId: string;
  agentId: string;
  /** Heure du brouillon restauré, pour que la mention ne parte pas de zéro. */
  initialSavedAt: number | null;
}) {
  const key = storageKey(ticketId, agentId);
  const [savedAt, setSavedAt] = useState<number | null>(initialSavedAt);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dernier brouillon reçu et pas encore écrit : ce que le minuteur doit poser. */
  const pending = useRef<Omit<ReplyDraft, "savedAt"> | null>(null);

  /**
   * Écrit le brouillon en attente, tout de suite.
   *
   * `notify` est faux quand l'écriture a lieu au démontage ou au départ de la
   * page : le composant ne sera plus là pour afficher l'heure, et déclencher un
   * rendu à cet instant ne servirait à rien.
   */
  const flush = useCallback(
    (notify: boolean) => {
      const draft = pending.current;
      pending.current = null;
      if (!draft) return;

      // Un contenu redevenu vide efface l'entrée au lieu d'enregistrer du vide :
      // sinon un agent qui vide son champ retrouverait la mention d'un brouillon
      // enregistré alors qu'il vient précisément de tout effacer.
      if (!draft.html.trim() && !draft.note.trim()) {
        safely(() => window.localStorage.removeItem(key));
        if (notify) setSavedAt(null);
        return;
      }

      const at = Date.now();
      const written = safely(() =>
        window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: at }))
      );
      // `setItem` a levé (quota atteint, navigation privée) : ne pas annoncer un
      // enregistrement qui n'a pas eu lieu, l'agent s'y fierait.
      if (notify && written !== null) setSavedAt(at);
    },
    [key]
  );

  const clear = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = null;
    safely(() => window.localStorage.removeItem(key));
    setSavedAt(null);
  }, [key]);

  /** Enregistre le brouillon, au repos de frappe. */
  const save = useCallback(
    (draft: Omit<ReplyDraft, "savedAt">) => {
      pending.current = draft;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flush(true), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  /**
   * Ce qui reste dans le minuteur au moment où l'on quitte est écrit tout de
   * suite, et non abandonné.
   *
   * C'est le cœur du dispositif : la demi-seconde d'attente qui évite d'écrire à
   * chaque caractère est exactement celle qui emporterait la dernière phrase si
   * le départ de la page se contentait d'annuler le minuteur.
   *
   * Deux déclencheurs, parce qu'aucun ne couvre l'autre : le démontage vaut pour
   * une navigation interne (on clique le dossier client, le composant part sans
   * que la page se recharge) ; `pagehide` vaut pour la fermeture de l'onglet, le
   * rechargement et la sortie vers un autre site, où aucun démontage n'a lieu.
   * Il couvre aussi iOS, où un onglet passé en arrière-plan peut être déchargé
   * sans autre préavis.
   */
  useEffect(() => {
    function handlePageHide() {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush(false);
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      handlePageHide();
    };
  }, [flush]);

  return { savedAt, save, clear };
}
