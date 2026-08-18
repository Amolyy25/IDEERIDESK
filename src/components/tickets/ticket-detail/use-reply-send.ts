"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTicketMessage } from "@/lib/actions/ticket-messages";
import { noticeStaleDeployment } from "@/lib/stale-deployment";
import { plural } from "@/lib/utils";

// Alignées sur les animations `reply-*` de globals.css. C'est un minuteur et non
// `animationend` qui fait avancer les étapes : sous `prefers-reduced-motion`
// l'animation n'existe pas et l'événement ne viendrait jamais.
const LIFT_MS = 600;
const RETURN_MS = 500;

// Durée d'affichage de la coche après un envoi réussi.
const CONFIRM_HOLD_MS = 1600;

// `sent` n'arrive qu'au retour du serveur, pas au clic. Deux retours au repos aussi :
// `returning` efface une coche affichée, `aborting` ramène un envoi refusé.
export type SendPhase = "idle" | "sending" | "sent" | "returning" | "aborting";

/** Le message tel qu'il partira, figé au clic sur « Envoyer ». */
export type PreparedReply = {
  content: string;
  /** Mise en forme de la réponse publique. `null` pour une note interne. */
  contentHtml: string | null;
  isPrivate: boolean;
  /** Note interne citée, quand la note répond à une autre. */
  replyToId: string | null;
};

/** Un message parti du bouton mais pas encore du serveur : la fenêtre de rattrapage. */
export type QueuedReply = PreparedReply & {
  dueAt: number;
  /** Durée totale de la fenêtre, dont la jauge a besoin pour se vider en rythme. */
  delayMs: number;
};

type UseReplySendOptions = {
  ticketId: string;
  /** Secondes de rattrapage après le clic. `0` : le message part immédiatement. */
  sendDelaySeconds: number;
  /** Écourte la confirmation dès que l'agent recommence à écrire. */
  isEmpty: boolean;
  clearField: (isPrivate: boolean) => void;
  restoreField: (reply: PreparedReply) => void;
  focusComposer: (isPrivate: boolean) => void;
  onSent: () => void;
};

export function useReplySend({
  ticketId,
  sendDelaySeconds,
  isEmpty,
  clearField,
  restoreField,
  focusComposer,
  onSent,
}: UseReplySendOptions) {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  // Copie du message pendant son départ : le champ est vidé dès le clic, c'est
  // cette copie qui monte par-dessus.
  const [messageInFlight, setMessageInFlight] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedReply | null>(null);

  // Faux une fois le ticket quitté : un envoi parti au démontage aboutit encore,
  // mais il n'a plus d'écran où afficher son résultat.
  const isMountedRef = useRef(true);

  // La copie du message se retire d'elle-même une fois montée, sans attendre le
  // serveur : les lier aurait laissé un texte figé sur le champ pendant une
  // connexion lente.
  useEffect(() => {
    if (messageInFlight === null) return;
    const timer = setTimeout(() => setMessageInFlight(null), LIFT_MS);
    return () => clearTimeout(timer);
  }, [messageInFlight]);

  // La coche confirme, puis rend la place à l'avion — les deux étapes dans le
  // même effet, pour que le bouton ne puisse pas rester bloqué sur `sent`.
  useEffect(() => {
    if (sendPhase === "idle" || sendPhase === "sending") return;

    const isConfirming = sendPhase === "sent";
    const hold = isEmpty ? CONFIRM_HOLD_MS : 0;

    const timer = setTimeout(
      () => setSendPhase(isConfirming ? "returning" : "idle"),
      isConfirming ? hold : RETURN_MS
    );
    return () => clearTimeout(timer);
  }, [sendPhase, isEmpty]);

  // Le message est PASSÉ en argument, jamais relu dans l'état : appelée par le
  // minuteur ou au démontage, elle ne doit rien devoir au champ de cet instant.
  async function sendMessage(reply: PreparedReply) {
    setIsSubmitting(true);
    // Le champ se vide tout de suite : l'aller-retour serveur se joue pendant la
    // montée du message. En cas d'échec, le texte est rendu tel quel.
    clearField(reply.isPrivate);
    setMessageInFlight(reply.content);
    setSendPhase("sending");

    try {
      const result = await addTicketMessage(ticketId, {
        content: reply.content,
        contentHtml: reply.contentHtml ?? undefined,
        isPrivate: reply.isPrivate,
        replyToId: reply.replyToId ?? undefined,
      });

      // Le brouillon a fini son office : le garder ferait réapparaître une
      // réponse déjà partie à la prochaine ouverture du ticket.
      onSent();
      setSendPhase("sent");

      if (reply.isPrivate && result.mentionedNames.length > 0) {
        const names = result.mentionedNames;
        toast.success(
          `Note ajoutée · ${names.join(", ")} notifié${plural(names.length)} par email`
        );
      }

      if (!reply.isPrivate) {
        announceReply(result);
        // Annonce distincte : le ticket vient de changer de main sans que l'agent
        // l'ait demandé, sinon il le découvre plus tard dans la file.
        if (result.selfAssigned) {
          toast.info("Ticket pris en charge : il vous est maintenant assigné");
        }
      }

      // Inutile depuis un ticket déjà quitté : le fil à rafraîchir n'est plus
      // celui qu'on regarde. Le message, lui, est bien parti.
      if (isMountedRef.current) router.refresh();
    } catch (error) {
      // Le texte revient dans le champ, mise en forme comprise. Le brouillon
      // local n'a pas été effacé : `onSent` n'est atteint qu'en cas de succès.
      restoreField(reply);
      // `aborting` et non `idle` : l'avion est parti, il doit revenir se poser.
      setSendPhase("aborting");
      setMessageInFlight(null);

      // Onglet resté sur une version qui n'est plus déployée : ce n'est pas la
      // réponse qui a été refusée, c'est la page qui est périmée, et seul un
      // rechargement y change quelque chose. Le bandeau posé par
      // `noticeStaleDeployment` le dit.
      if (noticeStaleDeployment(error)) return;

      let message = "Impossible d'envoyer le message";
      if (error instanceof Error) {
        message = error.message;
      }
      // Envoi parti au démontage : le champ où le texte serait revenu n'existe
      // plus, il faut donc dire où le retrouver.
      if (!isMountedRef.current) {
        message += " — le brouillon est conservé sur le ticket.";
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // L'envoi rangé dans une référence : branché directement, le minuteur
  // repartirait de zéro à chaque frappe et l'envoi n'arriverait jamais.
  const sendRef = useRef<(reply: PreparedReply) => void>(() => {});
  useEffect(() => {
    sendRef.current = (reply) => {
      void sendMessage(reply);
    };
  });

  // Le message en attente, lisible depuis l'effet de démontage.
  const queuedRef = useRef<QueuedReply | null>(null);
  useEffect(() => {
    queuedRef.current = queued;
  }, [queued]);

  // La référence est vidée avant l'envoi et sans attendre le rendu suivant : un
  // démontage glissé entre les deux renverrait le message une seconde fois.
  function releaseQueued() {
    queuedRef.current = null;
    setQueued(null);
  }

  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => {
      releaseQueued();
      sendRef.current(queued);
    }, Math.max(0, queued.dueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [queued]);

  // Quitter le ticket pendant l'attente n'annule pas l'envoi, il part tout de suite :
  // la fenêtre de rattrapage ne s'étend pas à la navigation.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const pendingReply = queuedRef.current;
      if (pendingReply) sendRef.current(pendingReply);
    };
  }, []);

  // Fermeture de l'onglet pendant l'attente : une Server Action ne survit pas au
  // déchargement, rien ne peut plus partir. Le brouillon local, lui, est conservé.
  useEffect(() => {
    if (!queued) return;

    function confirmLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Toujours attendu par les navigateurs qui ignorent `preventDefault` seul.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [queued]);

  // Échap rattrape, ⌘/Ctrl + Entrée abrège. Sur le document, parce que le bouton qui
  // avait le curseur vient d'être remplacé par la barre d'attente.
  //
  // L'écoute ne s'arme qu'au tour de boucle suivant : sans ce setTimeout elle voit
  // passer l'appui qui vient de l'installer (React applique l'état avant que
  // ⌘ + Entrée ait fini de remonter), et le délai ne tiendrait qu'à la souris.
  useEffect(() => {
    if (!queued) return;
    // Repris dans une constante : `handleKeyDown` est hissée, et le compilateur y
    // perd le fait que `queued` a déjà été écarté du cas nul.
    const pendingReply = queued;

    let armed = false;
    const arming = setTimeout(() => {
      armed = true;
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (!armed) return;
      if (event.key === "Escape") {
        event.preventDefault();
        releaseQueued();
        focusComposer(pendingReply.isPrivate);
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        releaseQueued();
        sendRef.current(pendingReply);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(arming);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [queued, focusComposer]);

  /** Remet le message au minuteur, ou le passe au serveur si aucun délai n'est réglé. */
  function startSend(reply: PreparedReply) {
    if (sendDelaySeconds > 0) {
      const delayMs = sendDelaySeconds * 1000;
      setQueued({ ...reply, delayMs, dueAt: Date.now() + delayMs });
      return;
    }
    void sendMessage(reply);
  }

  /** Renonce à l'attente et rend le curseur au champ. */
  function resumeEditing(reply: QueuedReply) {
    releaseQueued();
    focusComposer(reply.isPrivate);
  }

  function flushQueued(reply: QueuedReply) {
    releaseQueued();
    sendRef.current(reply);
  }

  return {
    isSubmitting,
    sendPhase,
    messageInFlight,
    queued,
    isQueued: queued !== null,
    startSend,
    releaseQueued,
    resumeEditing,
    flushQueued,
  };
}

/** Résultat d'un envoi, réduit à ce dont l'annonce a besoin. */
type ReplyOutcome = {
  emailSent: boolean;
  emailSkippedReason: string | null;
  alsoSentTo: number;
  pendingApproval: boolean;
  /** Le ticket n'était assigné à personne : répondre vient de le confier à l'agent. */
  selfAssigned: boolean;
};

// Seuls les envois qui ne se passent pas comme prévu sont annoncés : le cas nominal
// est déjà porté par la coche du bouton, et une bannière verte systématique finit
// par se fermer sans être lue, avertissements compris.
function announceReply(result: ReplyOutcome) {
  if (result.pendingApproval) {
    toast.info("Réponse envoyée pour validation, en attente d'un agent habilité.");
    return;
  }

  const extra = result.alsoSentTo;

  if (result.emailSent) {
    if (extra === 0) return;
    toast.success(
      `Réponse envoyée par email · ${extra} client${plural(extra)} de ticket${plural(
        extra
      )} fusionné${plural(extra)} également`
    );
    return;
  }

  // Aucun client sur ce ticket, mais des doublons rattachés : la réponse est bien
  // partie, il ne faut pas l'annoncer comme un échec.
  if (extra > 0) {
    toast.success(`Réponse envoyée aux clients des tickets fusionnés (${extra})`);
    return;
  }

  if (result.emailSkippedReason) {
    toast.warning(`Réponse enregistrée, mais non envoyée par email (${result.emailSkippedReason})`);
    return;
  }
  toast.warning("Réponse enregistrée, mais non envoyée par email");
}
