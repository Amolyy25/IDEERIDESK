"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Lock,
  PenLine,
  Pencil,
  Reply,
  Save,
  Send,
  Timer,
  Undo2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, shortcutTitle, useModifierKey, type ModifierKey } from "@/components/ui/kbd";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn, plural } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import { CannedResponsePicker } from "@/components/tickets/ticket-detail/canned-response-picker";
import { AiMenu } from "@/components/tickets/ticket-detail/ai-menu";
import { PresenceStrip } from "@/components/tickets/ticket-detail/presence-strip";
import { useTicketPresence } from "@/components/tickets/ticket-detail/use-ticket-presence";
import {
  useReplyDraftWriter,
  useStoredReplyDraft,
  type ReplyDraft,
} from "@/components/tickets/ticket-detail/use-reply-draft";
import { ReplyEditor } from "@/components/editor/reply-editor";
import {
  GameOverCurtain,
  GAME_OVER_MS,
} from "@/components/tickets/ticket-detail/game-over-curtain";
import { findInsult } from "@/lib/insult-easter-egg";
import { playGameOverJingle } from "@/lib/game-over-sound";
import { appendReplyHtml, isReplyHtmlEmpty, textToReplyHtml } from "@/lib/reply-html";
import { htmlToText } from "@/lib/html-to-text";
import { noticeStaleDeployment } from "@/lib/stale-deployment";
import {
  DEFAULT_REWRITE_INTENT,
  MAX_REWRITE_INPUT_CHARS,
  findRewriteIntent,
  type RewriteIntentId,
} from "@/lib/ai-rewrite";
import type { MentionableAgent } from "@/lib/mentions";
import type { TicketCannedResponses } from "@/lib/canned-responses";

/**
 * Durées de la séquence d'envoi, en millisecondes. Elles doivent rester alignées
 * sur les animations `reply-*` de globals.css : c'est un minuteur, et non la fin
 * de l'animation, qui fait avancer les étapes — sous `prefers-reduced-motion`
 * l'animation n'existe pas et `animationend` ne se déclencherait jamais.
 */
const LIFT_MS = 600;
const RETURN_MS = 500;

/**
 * Combien de temps la coche reste affichée après un envoi réussi.
 *
 * Assez pour être vue en revenant du champ, trop court pour qu'on l'attende :
 * le bouton est de toute façon inerte tant que rien n'est écrit, et la première
 * frappe la fait disparaître avant l'heure.
 */
const CONFIRM_HOLD_MS = 1600;

/**
 * Combien de temps Tab doit rester enfoncée pour ouvrir la liste des reprises
 * au lieu d'en appliquer une.
 *
 * Un appui bref agit, un appui maintenu propose : c'est le geste du clavier
 * téléphonique, et il évite d'avoir à viser un menu à la souris pour changer
 * d'intention une fois sur dix.
 *
 * Six dixièmes de seconde, et non deux ou trois : la liste s'ouvre AU BOUT du
 * délai, pas au relâchement, donc la garder enfoncée plus longtemps donne le
 * même résultat — simplement obtenu plus tôt. Ce qui se joue vraiment ici est
 * l'autre bord : sous 300 ms, un appui un peu appuyé ouvrirait la liste alors
 * qu'on voulait seulement corriger son message.
 */
const HOLD_TO_CHOOSE_MS = 600;

/**
 * Étape de l'envoi.
 *
 * `sending` commence au clic, `sent` seulement au retour du serveur : ces deux
 * étapes ne disent pas la même chose. La première constate que le message a
 * quitté le champ, la seconde qu'il est parti au client — les confondre
 * reviendrait à afficher une confirmation avant d'en avoir une.
 *
 * Le retour au repos a lui aussi deux formes, et pour la même raison :
 * `returning` efface une coche affichée, `aborting` ramène un avion qui n'a
 * jamais été confirmé. Un seul état pour les deux ferait passer une coche —
 * fugace, mais lue — juste après un envoi refusé.
 */
type SendPhase = "idle" | "sending" | "sent" | "returning" | "aborting";

/**
 * Ce que l'IA vient de poser dans le champ, et ce qu'il y avait avant.
 *
 * L'assistant ne travaille jamais à côté du texte : il REMPLACE ce qui est
 * écrit, qu'il le corrige ou qu'il le propose de zéro. Un remplacement sans
 * retour arrière serait un piège — dix minutes d'écriture effacées par un
 * « Raccourcis » cliqué sur la mauvaise ligne, ou par une touche Tab appuyée
 * pour changer de champ. La version précédente est donc gardée tant que le
 * texte produit n'a pas été retouché.
 */
type AiEdit = {
  /** Ce qui est annoncé sous le champ : l'intention choisie, ou la suggestion. */
  label: string;
  /** Le mode dans lequel l'IA est intervenue : une note et une réponse ont chacune leur texte. */
  isPrivate: boolean;
  /** Le texte de l'agent, à restituer tel quel. */
  previous: string;
  /** Le texte produit : tant que le champ le contient encore, le retour est proposé. */
  produced: string;
};

/** Le message tel qu'il partira, figé au clic sur « Envoyer ». */
type PreparedReply = {
  /** Texte du message : la note telle quelle, ou la retranscription du HTML. */
  content: string;
  /** Mise en forme de la réponse publique. `null` pour une note interne. */
  contentHtml: string | null;
  isPrivate: boolean;
};

/**
 * Un message parti du bouton mais pas encore du serveur : la fenêtre de
 * rattrapage.
 *
 * Le contenu est FIGÉ à ce moment-là, et pas relu au moment de l'envoi. C'est ce
 * qui rend la fenêtre honnête : ce qui partira est exactement ce qui était à
 * l'écran au clic — le champ est d'ailleurs verrouillé entre-temps, et
 * reprendre la rédaction annule l'envoi au lieu de le modifier en douce.
 */
type QueuedReply = PreparedReply & {
  /** Instant de l'envoi réel, en millisecondes. */
  dueAt: number;
  /** Durée totale de la fenêtre, dont la jauge a besoin pour se vider en rythme. */
  delayMs: number;
};

/**
 * Zone de rédaction, en bas du fil : on écrit là où la conversation s'arrête.
 *
 * Ce premier composant ne fait qu'une chose : retrouver le brouillon laissé sur
 * ce ticket, et n'ouvrir la zone de rédaction qu'une fois la réponse connue.
 *
 * La clé de remontage est ce qui rend la restauration sûre. Le stockage local
 * n'existe pas côté serveur : le premier rendu ne peut donc rien savoir du
 * brouillon, et la valeur n'arrive qu'après l'hydratation. Amorcer les champs
 * depuis un effet reviendrait à écraser, un rendu plus tard, ce que l'agent
 * aurait déjà commencé à taper ; la clé, elle, remonte la zone de rédaction une
 * fois, avec le brouillon pour état INITIAL — après quoi plus rien ne vient
 * toucher au texte.
 */
export function ReplyBox(props: ReplyBoxProps) {
  const storedDraft = useStoredReplyDraft({
    ticketId: props.ticketId,
    agentId: props.currentAgentId,
  });

  return (
    <ReplyComposer
      key={storedDraft ? "restored" : "empty"}
      restoredDraft={storedDraft ?? null}
      {...props}
    />
  );
}

type ReplyBoxProps = {
  ticketId: string;
  /** Identifiant de l'agent connecté : le brouillon local est rangé sous son nom. */
  currentAgentId: string;
  currentAgentName: string;
  /** Destinataire de la réponse publique. Null quand aucun client n'est rattaché. */
  clientEmail: string | null;
  /**
   * Clients des tickets fusionnés qui recevront eux aussi cette réponse, chacun
   * dans sa propre conversation. Annoncé avant l'écriture, pas après l'envoi :
   * on ne rédige pas de la même façon pour une personne et pour cinq.
   */
  mergedRecipientCount?: number;
  canRespond: boolean;
  requiresApproval: boolean;
  /**
   * Signature déjà rendue (voir `SignatureBlock`), affichée sous le champ telle
   * qu'elle partira. `null` quand aucune signature n'est configurée pour cet
   * agent : le bloc disparaît alors complètement, plutôt que d'annoncer un
   * espace vide en bas des emails.
   */
  signature: React.ReactNode;
  /** Agents mentionnables en @ dans une note interne. */
  agents: MentionableAgent[];
  /**
   * Réponses type qui concernent ce ticket, variables déjà remplies (voir
   * /settings/canned-responses) : celles proposées dans la liste, et celle qui
   * pré-remplit le champ s'il en existe une.
   */
  cannedResponses: TicketCannedResponses;
  /**
   * Secondes pendant lesquelles la réponse reste rattrapable après le clic (voir
   * Paramètres > Général). `0` renvoie au comportement d'origine : le message
   * part au clic, sans fenêtre d'annulation.
   */
  sendDelaySeconds: number;
  /**
   * Une clé API est-elle configurée (Paramètres > IA) ?
   *
   * Faux : l'assistant n'apparaît pas du tout, raccourcis compris. Un bouton qui
   * ne peut que répondre « aucune clé configurée » n'est pas une invitation à en
   * configurer une, c'est une promesse non tenue à chaque clic — et l'agent qui
   * la découvre n'a de toute façon pas accès aux réglages.
   */
  aiEnabled: boolean;
};

/**
 * Le champ lui-même.
 *
 * Les deux modes ne sont pas deux options d'un même envoi mais deux
 * destinataires différents — le client, ou l'équipe. Tout ce qui change entre
 * les deux est donc annoncé : la couleur du bloc, le destinataire au-dessus du
 * champ, le libellé du bouton, et la signature (jointe à un email, absente
 * d'une note).
 */
function ReplyComposer({
  ticketId,
  currentAgentId,
  currentAgentName,
  clientEmail,
  mergedRecipientCount = 0,
  canRespond,
  requiresApproval,
  signature,
  agents,
  cannedResponses,
  sendDelaySeconds,
  aiEnabled,
  restoredDraft,
}: ReplyBoxProps & {
  /** Brouillon retrouvé à l'ouverture, ou `null`. Ne change jamais en cours de vie. */
  restoredDraft: ReplyDraft | null;
}) {
  const router = useRouter();
  const autoInserted = cannedResponses.autoInserted;
  // La réponse type arrive en texte : convertie une fois pour toutes en HTML
  // d'éditeur, pour que la comparaison « le champ contient-il encore le
  // pré-remplissage ? » porte sur deux valeurs de même nature.
  const [autoInsertedHtml] = useState(() => textToReplyHtml(autoInserted?.body ?? ""));

  // Un brouillon retrouvé l'emporte sur la réponse type : il est de la main de
  // l'agent, elle est une proposition de l'application.
  //
  // Le pré-remplissage comme le brouillon sont un état INITIAL, pas une valeur
  // imposée : dès ce premier rendu, le texte appartient à l'agent, qui le
  // réécrit ou l'efface sans que rien ne le remette.
  const [html, setHtml] = useState(restoredDraft?.html ?? autoInsertedHtml);
  // La note interne reste du texte, et ce n'est pas un oubli : son autocomplétion
  // en @ travaille sur une chaîne et une position de curseur, et rien de ce qui
  // s'y écrit ne part par email — la mise en forme n'y a pas de destinataire.
  const [note, setNote] = useState(restoredDraft?.note ?? "");
  // Le mode fait partie du brouillon : retrouver le texte d'une note interne
  // dans le champ « Répondre au client » est le pire des deux mondes — c'est la
  // confusion qui envoie au client ce qui était destiné à l'équipe.
  const [isPrivate, setIsPrivate] = useState(restoredDraft?.isPrivate ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  // La dernière intention utilisée, que la touche Tab rejoue. Elle reste sur ce
  // qui vient d'être demandé plutôt que de revenir à la correction : on
  // raccourcit rarement une seule fois, et rouvrir le menu à chaque passe
  // reviendrait à ne se servir du raccourci que pour la première.
  const [rewriteIntent, setRewriteIntent] = useState<RewriteIntentId>(DEFAULT_REWRITE_INTENT);
  const [aiEdit, setAiEdit] = useState<AiEdit | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  // Copie du message pendant son départ : le champ est vidé dès le clic, c'est
  // cette copie qui monte par-dessus.
  const [messageInFlight, setMessageInFlight] = useState<string | null>(null);
  // Le message en attente de départ, pendant la fenêtre d'annulation. `null`
  // couvre les deux situations où il n'y a rien à rattraper : rien n'a été
  // envoyé, ou le délai est réglé à zéro.
  const [queued, setQueued] = useState<QueuedReply | null>(null);
  // Le mot qui vient d'interrompre un envoi, le temps du GAME OVER.
  const [gameOverWord, setGameOverWord] = useState<string | null>(null);
  // Les mots pour lesquels la blague a déjà été faite. Une référence et non un
  // état : rien à l'écran n'en dépend, et la faire entrer dans le rendu ne
  // servirait qu'à en déclencher un de plus.
  const excusedInsults = useRef(new Set<string>());

  // Poignées pour rendre le curseur au champ après une annulation : c'est le
  // champ, et non le bouton qui vient d'être cliqué, qui doit reprendre la main.
  const editorFocusRef = useRef<(() => void) | null>(null);
  const noteFocusRef = useRef<(() => void) | null>(null);
  // Faux une fois le ticket quitté : un envoi parti au démontage aboutit encore
  // (c'est le but), mais il n'a plus d'écran où afficher son résultat.
  const isMountedRef = useRef(true);

  // L'appui en cours sur Tab : le minuteur qui décide entre agir et proposer, et
  // le souvenir de ce qu'il a décidé — le relâchement ne doit pas déclencher une
  // réécriture par-dessus la liste qui vient de s'ouvrir.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdOpenedMenu = useRef(false);

  const modifier = useModifierKey();

  const isEmpty = isPrivate ? !note.trim() : isReplyHtmlEmpty(html);
  const status = metaLine({ isPrivate, currentAgentName, requiresApproval });
  // Le champ est verrouillé pendant l'attente : ce qui part doit être ce qui a
  // été relu. Corriger sans annuler ferait partir un texte que personne n'a
  // jamais vu en entier.
  const isQueued = queued !== null;
  // Le champ est également figé le temps d'une réécriture : le texte qui revient
  // remplace tout: ce qui serait tapé entre-temps serait perdu sans trace.
  const isLocked = isQueued || isRewriting;
  // Le texte affiché est encore exactement celui que l'IA a produit : passé la
  // première correction de l'agent, la proposition de revenir en arrière
  // emporterait son travail, elle disparaît donc.
  const aiEditIntact =
    aiEdit !== null &&
    aiEdit.isPrivate === isPrivate &&
    (isPrivate ? note : html) === aiEdit.produced;

  const {
    savedAt: draftSavedAt,
    save: saveDraft,
    clear: clearDraft,
  } = useReplyDraftWriter({
    ticketId,
    agentId: currentAgentId,
    initialSavedAt: restoredDraft?.savedAt ?? null,
  });

  // Le champ ne contient encore que ce que l'application y a posé : la réponse
  // type pré-remplie, et rien d'autre.
  const untouchedPrefill = html === autoInsertedHtml && !note.trim();

  // Le brouillon retrouvé est encore intact. Sert à deux choses : ne pas le
  // réenregistrer à l'identique en arrivant (l'heure affichée deviendrait celle
  // de l'ouverture du ticket, pas celle de la dernière frappe), et retirer la
  // mention qui l'annonce dès la première correction — passé ce point, ce n'est
  // plus « ce qu'on avait laissé », c'est ce qu'on est en train d'écrire.
  const draftIntact =
    restoredDraft !== null &&
    html === restoredDraft.html &&
    note === restoredDraft.note &&
    isPrivate === restoredDraft.isPrivate;

  // Enregistrement continu, dès que le contenu est de la main de l'agent.
  useEffect(() => {
    if (untouchedPrefill || draftIntact) return;
    saveDraft({ html, note, isPrivate });
  }, [saveDraft, html, note, isPrivate, untouchedPrefill, draftIntact]);

  /**
   * Qui d'autre est sur ce dossier en ce moment.
   *
   * « Rédiger » se mesure sur un brouillon NON VIDE et non sur le fait d'avoir le
   * champ sous les yeux : c'est la présence d'un texte en cours qui annonce une
   * réponse imminente, pas le curseur. Une note interne compte aussi — deux
   * agents qui écrivent en même temps ont de toute façon à se parler.
   *
   * Le champ pré-rempli par une réponse type ne déclenche rien tant qu'il n'a pas
   * été touché : annoncer « il rédige » à l'ouverture d'une fiche, sans que
   * personne n'ait tapé quoi que ce soit, discréditerait l'indicateur.
   */
  const composing = !isEmpty && !untouchedPrefill;
  const others = useTicketPresence({ ticketId, composing });

  // La copie du message se retire d'elle-même une fois montée. Son sort est
  // détaché de celui du bouton : elle dure ce que dure son animation, quand le
  // bouton, lui, attend le serveur — un aller-retour dont on ne connaît pas la
  // durée. Les lier aurait laissé un texte figé sur le champ pendant une
  // connexion lente.
  useEffect(() => {
    if (messageInFlight === null) return;
    const timer = setTimeout(() => setMessageInFlight(null), LIFT_MS);
    return () => clearTimeout(timer);
  }, [messageInFlight]);

  // Le rideau se lève tout seul. Un minuteur et non la fin d'une animation :
  // il y en a deux cent quarante qui se terminent à des instants différents, et
  // aucune sous `prefers-reduced-motion`.
  useEffect(() => {
    if (gameOverWord === null) return;
    const timer = setTimeout(() => setGameOverWord(null), GAME_OVER_MS);
    return () => clearTimeout(timer);
  }, [gameOverWord]);

  // La coche confirme, puis rend la place à l'avion. Deux étapes enchaînées par
  // ce seul effet, pour que le bouton ne puisse pas rester bloqué sur une
  // confirmation.
  useEffect(() => {
    if (sendPhase === "idle" || sendPhase === "sending") return;

    const isConfirming = sendPhase === "sent";
    // La confirmation est écourtée dès que l'agent recommence à écrire : elle
    // porte sur le message précédent, la laisser au-dessus du texte en cours la
    // rendrait fausse.
    const hold = isEmpty ? CONFIRM_HOLD_MS : 0;

    const timer = setTimeout(
      () => setSendPhase(isConfirming ? "returning" : "idle"),
      isConfirming ? hold : RETURN_MS
    );
    return () => clearTimeout(timer);
  }, [sendPhase, isEmpty]);

  /**
   * L'envoi réel, tel qu'il sera appelé par le minuteur.
   *
   * Rangé dans une référence remise à jour à chaque rendu : le minuteur ne doit
   * dépendre que du message en attente. Le brancher directement sur la fonction
   * la ferait changer d'identité à chaque frappe, et le décompte repartirait de
   * zéro à chaque rendu — un envoi qui n'arriverait jamais.
   */
  const sendRef = useRef<(reply: PreparedReply) => void>(() => {});
  useEffect(() => {
    sendRef.current = (reply) => {
      void sendMessage(reply);
    };
  });

  // Le message en attente, lisible depuis un effet de démontage qui, lui, ne
  // sera monté qu'une fois.
  const queuedRef = useRef<QueuedReply | null>(null);
  useEffect(() => {
    queuedRef.current = queued;
  }, [queued]);

  /**
   * Sortie de la fenêtre d'attente, quelle qu'en soit la raison.
   *
   * La référence est vidée dans le même souffle que l'état, et surtout AVANT que
   * l'envoi ne parte : la mise à jour de l'état, elle, n'atteindra la référence
   * qu'au rendu suivant. Un démontage glissé entre les deux retrouverait un
   * message déjà parti et l'enverrait une seconde fois — c'est-à-dire deux fois
   * la même réponse chez le client.
   */
  function releaseQueued() {
    queuedRef.current = null;
    setQueued(null);
  }

  // Le compte à rebours lui-même.
  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => {
      releaseQueued();
      sendRef.current(queued);
    }, Math.max(0, queued.dueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [queued]);

  /**
   * Quitter le ticket pendant l'attente n'annule pas l'envoi : il part tout de
   * suite.
   *
   * C'est le seul arbitrage possible. Un agent qui clique « Envoyer » puis passe
   * au dossier suivant a répondu — abandonner son message parce qu'il a changé
   * de page laisserait un client sans réponse, sans que personne ne s'en
   * aperçoive avant la relance. La fenêtre d'annulation dure ce qu'elle dure,
   * elle ne s'étend pas à la navigation.
   *
   * Le démontage ne couvre que la navigation interne ; la fermeture de l'onglet
   * est traitée juste en dessous.
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      const pendingReply = queuedRef.current;
      if (pendingReply) sendRef.current(pendingReply);
    };
  }, []);

  /**
   * Fermeture de l'onglet pendant l'attente : le navigateur demande confirmation.
   *
   * Rien ne peut être envoyé à cet instant — une Server Action ne survit pas au
   * déchargement de la page. Le message n'est pas perdu pour autant (le
   * brouillon local n'a pas encore été effacé, il sera proposé à la réouverture
   * du ticket), mais partir en croyant avoir répondu est exactement ce que cette
   * confirmation évite.
   */
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

  /**
   * Le clavier pendant l'attente : Échap rattrape, ⌘/Ctrl + Entrée abrège.
   *
   * Posé sur le document et non sur le formulaire : le bouton qui avait le
   * curseur vient d'être remplacé par la barre d'attente, le focus est donc
   * retombé sur la page. L'écoute ne vit que le temps de la fenêtre — Échap
   * n'est capté à aucun autre moment.
   */
  useEffect(() => {
    if (!queued) return;
    // Repris dans une constante locale : `handleKeyDown` est une déclaration,
    // hissée, et le compilateur y perd le fait que `queued` a déjà été écarté du
    // cas nul deux lignes plus haut.
    const pendingReply = queued;

    function handleKeyDown(event: KeyboardEvent) {
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
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [queued]);

  /**
   * Rend le curseur au champ, après le rendu qui l'aura déverrouillé.
   *
   * Le minuteur à zéro n'est pas une facilité : `setQueued(null)` ne déverrouille
   * l'éditeur qu'au rendu suivant, et un `focus()` appelé avant retomberait sur
   * un champ encore en lecture seule.
   */
  function focusComposer(privateMode: boolean) {
    setTimeout(() => {
      const focus = privateMode ? noteFocusRef.current : editorFocusRef.current;
      focus?.();
    }, 0);
  }

  /**
   * Insère une réponse type dans le champ.
   *
   * Le texte déjà écrit n'est jamais remplacé : la réponse type s'ajoute à la
   * suite, en paragraphes à part. Écraser une phrase en cours de rédaction pour
   * un clic sur la mauvaise ligne de la liste serait un coût sans retour.
   */
  function handleInsertCannedResponse(body: string) {
    setHtml(appendReplyHtml(html, textToReplyHtml(body)));
  }

  /**
   * Pose dans le champ un texte produit par l'IA, en gardant celui de l'agent.
   *
   * Passage OBLIGÉ de tout ce que l'assistant écrit — suggestion comme
   * réécriture. C'est ce qui garantit qu'aucune de ses interventions ne peut
   * coûter définitivement un brouillon : la version précédente reste offerte
   * sous le champ tant que le texte produit n'a pas été retouché.
   */
  function applyAiEdit(edit: AiEdit) {
    if (edit.isPrivate) setNote(edit.produced);
    else setHtml(edit.produced);
    setAiEdit(edit);
    // Le curseur revient en fin de texte, prêt à corriger : le champ avait perdu
    // la main en se verrouillant, et faire relire l'IA pour devoir ensuite
    // recliquer dans le champ casserait l'enchaînement — c'est précisément ce
    // que le raccourci cherchait à éviter.
    focusComposer(edit.isPrivate);
  }

  function undoAiEdit() {
    if (!aiEdit) return;
    if (aiEdit.isPrivate) setNote(aiEdit.previous);
    else setHtml(aiEdit.previous);
    setAiEdit(null);
  }

  async function handleSuggest() {
    // Réservée à la réponse publique : elle écrit dans le champ du client, et
    // ne saurait de toute façon pas quoi proposer pour une note d'équipe.
    if (!aiEnabled || isPrivate || isSuggesting || isLocked) return;
    setIsSuggesting(true);
    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Impossible de générer une suggestion.");
      }
      // La suggestion arrive en texte brut : convertie en paragraphes plutôt
      // qu'insérée telle quelle, faute de quoi une réponse de dix lignes
      // atterrirait dans l'éditeur en un seul bloc.
      //
      // Aucune notification de réussite : la mention sous le champ dit déjà d'où
      // vient ce texte, et le dit tant qu'il est là — là où une notification
      // aurait disparu avant qu'on ait fini de lire la première phrase.
      applyAiEdit({
        label: "Suggestion complète",
        isPrivate: false,
        previous: html,
        produced: textToReplyHtml(result.suggestion),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de générer une suggestion."
      );
    } finally {
      setIsSuggesting(false);
    }
  }

  /**
   * Fait reprendre par l'IA ce qui est déjà écrit (touche Tab, ou menu
   * « Réécrire »).
   *
   * L'intention choisie devient celle du raccourci : demander « Raccourcir » une
   * fois, puis appuyer sur Tab, raccourcit à nouveau. C'est ce qui permet de
   * converger en trois appuis au lieu de rouvrir le menu à chaque essai.
   */
  async function handleRewrite(intent: RewriteIntentId, instruction?: string) {
    if (!aiEnabled || isRewriting || isSuggesting || isQueued || isSubmitting) return;

    const source = isPrivate ? note : html;
    // Rien à reprendre : le raccourci se tait plutôt que d'annoncer une erreur.
    // Tab retrouve alors son rôle habituel, celui de changer de champ.
    if (isPrivate ? !note.trim() : isReplyHtmlEmpty(html)) return;

    // Arrêté ici et non par le serveur : « Requête invalide » n'apprendrait rien
    // à un agent qui vient de coller un journal d'erreurs de trois pages.
    if (source.length > MAX_REWRITE_INPUT_CHARS) {
      toast.error("Message trop long pour être réécrit par l'IA.");
      return;
    }

    const label =
      intent === "custom"
        ? (instruction ?? "").trim()
        : findRewriteIntent(intent).label;

    setRewriteIntent(intent);
    setIsRewriting(true);
    try {
      const response = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticketId,
          text: source,
          // Une note interne est du texte brut de bout en bout ; une réponse
          // publique garde sa mise en forme, listes et liens compris.
          format: isPrivate ? "text" : "html",
          intent,
          instruction,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Impossible de réécrire le message.");
      }

      const produced = typeof result.result === "string" ? result.result : "";
      if (!produced.trim()) {
        throw new Error("L'IA n'a rien renvoyé.");
      }

      // Rien n'a bougé — cas courant d'une correction sur un texte déjà propre.
      // Le dire franchement plutôt que d'annoncer une réécriture qui n'a pas eu
      // lieu : sans cela, l'agent relit son message en cherchant ce qui a
      // changé, et finit par douter de ce qu'il avait écrit.
      if (produced.trim() === source.trim()) {
        toast.info("Rien à reprendre : le message est laissé tel quel.");
        // Le champ reprend la main comme après une vraie réécriture : le
        // verrouillage lui avait pris le curseur, il doit le rendre.
        focusComposer(isPrivate);
        return;
      }

      applyAiEdit({ label, isPrivate, previous: source, produced });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de réécrire le message."
      );
    } finally {
      setIsRewriting(false);
    }
  }

  /**
   * Le clic sur « Envoyer », qui n'envoie plus forcément.
   *
   * Tout ce qui doit se juger sur le texte à l'écran se juge ici — le champ
   * vide, le double clic, l'insulte — et le message est figé dans la foulée. Ne
   * reste ensuite qu'une décision : le remettre au minuteur, ou le passer
   * directement au serveur quand aucun délai n'est configuré.
   */
  function handleSubmit() {
    // `isRewriting` compris : envoyer pendant que l'IA reprend le message ferait
    // partir la version d'avant, et retomber la réécriture dans un champ vidé —
    // deux textes qui se croisent, dont aucun n'est celui qu'on croyait envoyer.
    if (isEmpty || isSubmitting || isQueued || isRewriting) return;

    // Une réponse publique part sous ses deux formes : le HTML pour la mise en
    // forme, sa retranscription pour le client dont la boîte mail n'affiche pas
    // le HTML. Une note interne n'a que du texte.
    const reply: PreparedReply = {
      content: isPrivate ? note : htmlToText(html),
      contentHtml: isPrivate ? null : html,
      isPrivate,
    };

    // Le contrôle passe AVANT tout le reste : le champ ne se vide pas, le
    // brouillon n'est pas touché, rien ne part au serveur. Ce qui est écrit
    // reste exactement où il est, prêt à être corrigé — ou renvoyé tel quel au
    // clic suivant, car ce n'est pas une interdiction (voir `findInsult`).
    const insult = findInsult(reply.content);
    if (insult && !excusedInsults.current.has(insult)) {
      excusedInsults.current.add(insult);
      setGameOverWord(insult);
      playGameOverJingle();
      return;
    }

    if (sendDelaySeconds > 0) {
      const delayMs = sendDelaySeconds * 1000;
      setQueued({ ...reply, delayMs, dueAt: Date.now() + delayMs });
      return;
    }

    void sendMessage(reply);
  }

  /**
   * Le clavier de la zone de rédaction, hors fenêtre d'annulation (celle-ci a
   * ses propres touches, voir plus haut).
   *
   * Tab reprend le message, ⌘/Ctrl + Entrée envoie, ⌘/Ctrl + O fait proposer un
   * brouillon, Échap rend la main. Tout est écouté à la REMONTÉE de l'événement,
   * sur le formulaire entier : l'éditeur de texte riche et le champ de note
   * traitent déjà certaines de ces touches pour leur propre compte, et se
   * signalent en arrêtant l'événement — d'où le premier test, sans lequel un
   * même appui enverrait deux messages.
   */
  function handleShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;

    // Tab fait reprendre le message par l'IA. Bref : l'intention en cours
    // s'applique, au relâchement. Maintenue : la liste des intentions s'ouvre,
    // et rien ne s'applique — voir `HOLD_TO_CHOOSE_MS`.
    //
    // Trois garde-fous, et aucun n'est facultatif. La touche n'est détournée que
    // DANS la zone de saisie (`isWritingSurface`) : ailleurs dans le formulaire,
    // Tab reste la façon d'atteindre le bouton suivant. Elle ne l'est pas non
    // plus sur un champ vide — il n'y a rien à réécrire, et c'est ce cas qui
    // permet de traverser la zone de rédaction au clavier sans jamais y rester
    // pris. Enfin `defaultPrevented` laisse la main à l'éditeur, qui utilise Tab
    // pour indenter une liste, et à l'autocomplétion des mentions, qui s'en sert
    // pour valider un nom.
    //
    // Le retour en arrière (Maj + Tab) n'est jamais touché, et Échap rend la
    // main : personne ne se retrouve enfermé dans le champ.
    if (event.key === "Tab" && !event.shiftKey && !isLocked && aiEnabled) {
      if (!isWritingSurface(event.target)) return;
      if (isPrivate ? !note.trim() : isReplyHtmlEmpty(html)) return;
      event.preventDefault();
      // La répétition automatique du clavier renvoie l'événement toutes les
      // quelques dizaines de millisecondes : un seul minuteur, armé au premier.
      if (event.repeat || holdTimer.current) return;

      holdOpenedMenu.current = false;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdOpenedMenu.current = true;
        setAiMenuOpen(true);
      }, HOLD_TO_CHOOSE_MS);
      return;
    }

    // La sortie de secours du champ, pour qui navigue au clavier.
    if (event.key === "Escape" && !isLocked && isWritingSurface(event.target)) {
      (event.target as HTMLElement).blur();
      return;
    }

    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "enter") {
      event.preventDefault();
      handleSubmit();
      return;
    }
    // Comme le bouton : une suggestion s'écrit pour un client, elle n'a rien à
    // proposer sur une note interne.
    if (key === "o" && !isPrivate) {
      event.preventDefault();
      void handleSuggest();
    }
  }

  /**
   * Le relâchement de Tab : c'est lui qui applique la reprise.
   *
   * Agir au relâchement et non à l'appui est ce qui rend le maintien possible —
   * au moment de l'appui, on ne sait pas encore lequel des deux gestes est en
   * train d'être fait. La différence ne se sent pas : personne ne garde une
   * touche enfoncée en attendant un effet.
   */
  function handleShortcutRelease(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const pending = holdTimer.current;
    holdTimer.current = null;
    if (pending) clearTimeout(pending);

    // La liste a pris la main pendant l'appui : il n'y a plus rien à appliquer,
    // c'est à l'agent de choisir.
    if (holdOpenedMenu.current || !pending) return;

    void handleRewrite(rewriteIntent);
  }

  /**
   * L'envoi lui-même : le champ se vide, le message monte, le serveur répond.
   *
   * Le message lui est PASSÉ en argument et n'est pas relu dans l'état : appelée
   * par le minuteur ou au démontage, cette fonction ne doit rien devoir à ce que
   * le champ contient au moment où elle s'exécute.
   */
  async function sendMessage(reply: PreparedReply) {
    setIsSubmitting(true);
    // Le champ se vide et le message part immédiatement : l'aller-retour serveur
    // se joue pendant la montée, au lieu de laisser le texte figé dans le champ
    // en attendant la réponse. En cas d'échec, il est rendu tel quel.
    if (reply.isPrivate) setNote("");
    else setHtml("");
    setMessageInFlight(reply.content);
    setSendPhase("sending");

    try {
      const result = await addTicketMessage(ticketId, {
        content: reply.content,
        contentHtml: reply.contentHtml ?? undefined,
        isPrivate: reply.isPrivate,
      });

      // Le brouillon a fini son office : le garder ferait réapparaître, à la
      // prochaine ouverture du ticket, une réponse déjà partie au client.
      clearDraft();

      // C'est ici, et pas au clic, que la coche s'installe : elle ne confirme
      // rien tant que le serveur n'a pas répondu.
      setSendPhase("sent");

      if (reply.isPrivate && result.mentionedNames.length > 0) {
        const names = result.mentionedNames;
        toast.success(
          `Note ajoutée · ${names.join(", ")} notifié${plural(names.length)} par email`
        );
      }

      if (!reply.isPrivate) {
        announceReply(result);
        // Annonce distincte, et non fondue dans le message ci-dessus : le ticket
        // vient de changer de main sans que l'agent l'ait demandé. Un changement
        // qu'on n'a pas décidé soi-même doit se voir, sinon il se découvre plus
        // tard dans la file, sans explication.
        if (result.selfAssigned) {
          toast.info("Ticket pris en charge : il vous est maintenant assigné");
        }
      }

      // Inutile depuis un ticket qu'on a déjà quitté : le fil à rafraîchir n'est
      // plus celui qu'on regarde. Le message, lui, est bien parti.
      if (isMountedRef.current) router.refresh();
    } catch (error) {
      // Le texte revient dans le champ, mise en forme comprise : un envoi refusé
      // ne doit jamais coûter le message à l'agent. Le brouillon local, lui, n'a
      // pas été effacé — `clearDraft` n'est atteint qu'en cas de succès.
      if (reply.isPrivate) setNote(reply.content);
      else setHtml(reply.contentHtml ?? "");
      // `aborting` et non `idle` : l'avion est parti, il doit revenir se poser.
      // Le remettre d'un coup à sa place ferait un saut au moment précis où
      // l'agent découvre que son envoi a échoué.
      setSendPhase("aborting");
      setMessageInFlight(null);

      // Onglet resté sur une version qui n'est plus déployée : ce n'est pas la
      // réponse qui a été refusée, c'est la page qui est périmée. « Impossible
      // d'envoyer le message » enverrait l'agent réécrire ou relancer, alors que
      // seul un rechargement peut y changer quelque chose — et le bandeau posé
      // par `noticeStaleDeployment` le dit, lui.
      if (noticeStaleDeployment(error)) return;

      let message = "Impossible d'envoyer le message";
      if (error instanceof Error) {
        message = error.message;
      }
      // Le ticket a été quitté entre-temps (envoi parti au démontage) : le champ
      // où le texte serait revenu n'existe plus, il faut donc dire où le
      // retrouver — le brouillon local, lui, n'a pas été effacé.
      if (!isMountedRef.current) {
        message += " — le brouillon est conservé sur le ticket.";
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canRespond) {
    return (
      <div className="space-y-2">
        {/* Montrée même en lecture seule : savoir qu'un collègue rédige explique
            pourquoi il ne faut pas aller le chercher pour ce dossier. */}
        <PresenceStrip others={others} className="rounded-lg border" />
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Accès en lecture seule — vous ne pouvez pas répondre à ce ticket.
        </div>
      </div>
    );
  }

  return (
    <div
      // Les raccourcis sont écoutés sur le formulaire entier plutôt que sur le
      // document : ⌘ + Entrée n'a de sens que si l'on est en train d'écrire ici,
      // et un écouteur global enverrait la réponse depuis n'importe quel champ
      // de la fiche — la recherche, un attribut, une boîte de dialogue ouverte.
      onKeyDown={handleShortcut}
      onKeyUp={handleShortcutRelease}
      className={cn(
        // `relative` porte le rideau du GAME OVER, `overflow-hidden` retient les
        // pixels qui tombent : ils quittent le bloc, pas la page.
        "relative overflow-hidden rounded-lg border transition-colors",
        // Même code couleur que les notes internes du fil : impossible de se
        // tromper sur ce que le client verra.
        isPrivate ? "border-primary/40 bg-primary/5" : "bg-card"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="inline-flex rounded-md border bg-background p-0.5">
          {/* Verrouillés pendant l'attente, comme le champ : changer de
              destinataire sous un message déjà parti ne changerait rien à ce
              message, mais laisserait croire le contraire. */}
          <ModeButton
            selected={!isPrivate}
            onSelect={() => setIsPrivate(false)}
            disabled={isQueued}
            icon={<Reply className="size-4" />}
            label="Répondre au client"
          />
          <ModeButton
            selected={isPrivate}
            onSelect={() => setIsPrivate(true)}
            disabled={isQueued}
            icon={<Lock className="size-4" />}
            label="Note interne"
          />
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {recipientLine({ isPrivate, clientEmail, mergedRecipientCount })}
        </p>
      </div>

      {/* Entre l'en-tête et le champ : le dernier endroit que l'œil traverse
          avant de se poser sur le texte à écrire. */}
      <PresenceStrip others={others} className="border-b" />

      <div className="space-y-2 p-3">
        {/* Pourquoi il y a déjà du texte dans le champ. L'avis disparaît à la
            première frappe : passé ce point le brouillon est celui de l'agent,
            continuer à l'attribuer à une réponse type serait faux. */}
        {!isPrivate && autoInserted && html === autoInsertedHtml && (
          <PrefilledNotice title={autoInserted.title} onClear={() => setHtml("")} />
        )}

        {/* Ce qui a été retrouvé en ouvrant le ticket. Annoncé, et pas seulement
            restauré : un texte qui apparaît sans qu'on sache d'où il vient se
            fait envoyer sans être relu. */}
        {/* Ce que l'IA vient de faire du texte, et comment revenir en arrière.
            Disparaît dès la première correction de l'agent : au-delà, « revenir
            à ma version » lui coûterait ce qu'il vient d'écrire. */}
        {aiEditIntact && (
          <AiEditNotice
            label={aiEdit.label}
            previousWasEmpty={!aiEdit.previous.trim() || isReplyHtmlEmpty(aiEdit.previous)}
            onUndo={undoAiEdit}
          />
        )}

        {draftIntact && (
          <RestoredDraftNotice
            savedAt={restoredDraft.savedAt}
            onDiscard={() => {
              setHtml(autoInsertedHtml);
              setNote("");
              clearDraft();
            }}
          />
        )}

        <div className="relative">
          {/* L'autocomplétion des mentions n'est montée que sur la note interne :
              un @ dans une réponse publique ne notifie personne, proposer la liste
              de l'équipe y serait un piège. */}
          {isPrivate ? (
            <>
              <MentionTextarea
                value={note}
                onChange={setNote}
                onSubmit={handleSubmit}
                agents={agents}
                placeholder="Écrire une note interne… (@ pour mentionner un collègue)"
                rows={6}
                disabled={isLocked}
                focusRef={noteFocusRef}
              />
              <AiWorkingOverlay busy={isRewriting} isRewrite />
              {/* Cadre et rembourrage repris du `Textarea` qu'il recouvre, pour
                  que ce soit le champ lui-même qui semble s'élever et non un
                  rectangle apparu par-dessus. Le fond, lui, est volontairement
                  opaque et non calqué sur celui du champ (transparent) : il doit
                  masquer l'invite du champ vidé, qui transparaîtrait sinon à
                  travers le texte en train de monter. */}
              <MessageGhost className="rounded-lg border border-input bg-background px-3 py-2.5">
                {messageInFlight}
              </MessageGhost>
            </>
          ) : (
            <ReplyEditor
              value={html}
              onChange={setHtml}
              onSubmit={handleSubmit}
              placeholder="Écrire la réponse…"
              // Le texte reste lisible pendant l'attente, mais plus modifiable :
              // ces secondes-là servent à le relire, et le corriger sans annuler
              // ferait partir une version que personne n'a vue. Même verrou le
              // temps d'une réécriture, dont le résultat remplace tout : ce qui
              // serait tapé pendant l'aller-retour disparaîtrait sans trace.
              editable={!isLocked}
              focusRef={editorFocusRef}
              // Confié à l'éditeur plutôt que posé sur ce conteneur : le calque
              // doit couvrir la zone de saisie et pas la barre d'outils, dont la
              // hauteur ne se devine pas d'ici.
              // Rembourrage identique à celui de la zone de saisie : le texte
              // doit partir d'où il était, sans sauter d'abord de quelques
              // pixels. `bg-background` est celui de l'éditeur, à l'identique.
              overlay={
                <>
                  <MessageGhost className="bg-background px-3 py-2">
                    {messageInFlight}
                  </MessageGhost>
                  <AiWorkingOverlay busy={isSuggesting || isRewriting} isRewrite={isRewriting} />
                </>
              }
            />
          )}
        </div>

        {/* Uniquement sur la réponse publique : une note interne ne part pas par
            email, y montrer une signature laisserait croire le contraire. */}
        {!isPrivate && signature && (
          <SignatureDisclosure agentName={currentAgentName}>{signature}</SignatureDisclosure>
        )}

        {/* Pendant l'attente, la barre de rattrapage PREND LA PLACE des actions
            au lieu de s'ajouter au-dessus : il n'y a plus qu'une chose à décider
            — laisser partir, corriger, ou renoncer — et laisser un « Envoyer »
            cliquable sous un message déjà parti serait la meilleure façon de
            l'envoyer deux fois. */}
        {queued ? (
          <QueuedReplyBar
            reply={queued}
            modifier={modifier}
            onEdit={() => {
              releaseQueued();
              focusComposer(queued.isPrivate);
            }}
            onCancel={releaseQueued}
            onSendNow={() => {
              releaseQueued();
              sendRef.current(queued);
            }}
          />
        ) : (
          /* La ligne d'état peut être vide (cas courant) : `ml-auto` sur les
             actions les garde alors à droite, sans paragraphe fantôme pour tenir
             la place. */
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {status && <p className="text-xs text-muted-foreground">{status}</p>}
              <DraftStatus savedAt={draftSavedAt} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Réservé à la réponse publique, comme la suggestion IA : une
                  réponse type est écrite pour un client, la proposer sur une note
                  interne n'aurait pas de destinataire. */}
              {!isPrivate && (
                <CannedResponsePicker
                  responses={cannedResponses.available}
                  onInsert={handleInsertCannedResponse}
                />
              )}
              {/* L'assistant, en un seul bouton. Il change de rôle avec l'état
                  du champ (voir `AiMenu`) : proposer un brouillon quand il n'y
                  a rien, relire quand il y a quelque chose.

                  Sur une note interne, seule la réécriture a un sens : une
                  suggestion est écrite pour un client, elle n'a pas de
                  destinataire ici. Le bouton ne s'affiche donc que s'il y a du
                  texte à reprendre. */}
              {aiEnabled && (!isPrivate || !isEmpty) && (
                <AiMenu
                  hasText={!isEmpty}
                  canSuggest={!isPrivate}
                  isSuggesting={isSuggesting}
                  isRewriting={isRewriting}
                  disabled={isSubmitting}
                  activeIntent={rewriteIntent}
                  modifier={modifier}
                  open={aiMenuOpen}
                  onOpenChange={(next) => {
                    setAiMenuOpen(next);
                    // Refermée après un maintien de Tab : le curseur retourne
                    // dans le texte, là où il était avant l'appui. Sans cela il
                    // reviendrait sur le chevron, à deux tabulations du champ.
                    if (!next && holdOpenedMenu.current) {
                      holdOpenedMenu.current = false;
                      focusComposer(isPrivate);
                    }
                  }}
                  onSuggest={handleSuggest}
                  onRewrite={handleRewrite}
                />
              )}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || isEmpty || isRewriting}
                size="sm"
                className={cn(
                  // Le bouton est inerte pendant toute la séquence — l'envoi est
                  // en cours, puis le champ est vide — mais il ne doit pas
                  // s'éteindre pour autant : c'est lui qui porte la confirmation,
                  // et une coche à moitié effacée annonce mal une réussite.
                  sendPhase !== "idle" && "disabled:opacity-100"
                )}
                title={shortcutTitle(modifier, "Entrée")}
              >
                <SendIcon phase={sendPhase} />
                <SendLabel
                  phase={sendPhase}
                  isPrivate={isPrivate}
                  requiresApproval={requiresApproval}
                />
                {modifier && <Kbd data-icon="inline-end">{modifier} ↵</Kbd>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Posé en dernier et en `z-20` : il recouvre le formulaire entier, barre
          de mode et bouton d'envoi compris. Un rideau qui laisserait le bouton
          cliquable pendant qu'il annonce GAME OVER se ferait traverser. */}
      {gameOverWord !== null && <GameOverCurtain word={gameOverWord} />}
    </div>
  );
}

/**
 * La fenêtre de rattrapage, à la place des boutons d'envoi.
 *
 * Elle répond à trois questions, dans cet ordre : combien de temps me reste-t-il,
 * qu'est-ce qui part, et comment j'interviens. Le décompte est doublé d'une
 * jauge parce qu'un chiffre qui descend demande à être lu, quand une barre qui
 * se vide se voit du coin de l'œil — c'est justement ce qu'on fait pendant ces
 * secondes-là : on relit son message, pas la barre.
 *
 * Les trois sorties ne sont pas trois variantes d'une même action. « Envoyer
 * maintenant » renonce à l'attente, « Modifier » ramène le curseur dans le texte
 * pour le corriger, « Annuler » repose simplement le message dans le champ. Les
 * deux dernières laissent le texte intact : rien de ce qui a été écrit ne se
 * perd en renonçant à l'envoi.
 */
function QueuedReplyBar({
  reply,
  modifier,
  onEdit,
  onCancel,
  onSendNow,
}: {
  reply: QueuedReply;
  modifier: ModifierKey;
  onEdit: () => void;
  onCancel: () => void;
  onSendNow: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() => reply.dueAt - Date.now());

  // Le battement vit ici et non dans le formulaire : quatre rendus par seconde
  // n'ont aucune raison de traverser l'éditeur de texte riche et le fil des
  // messages. Un quart de seconde, parce qu'un décompte rafraîchi à la seconde
  // pile affiche presque toujours un chiffre déjà faux.
  useEffect(() => {
    const tick = setInterval(() => setRemainingMs(reply.dueAt - Date.now()), 250);
    return () => clearInterval(tick);
  }, [reply.dueAt]);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    // `mt-3` reprend l'écart effectif de la rangée de boutons qu'elle remplace
    // (l'espacement du conteneur, plus son `pt-1`) : la barre apparaît là où ils
    // étaient, sans décaler le champ au-dessus.
    <div role="status" className="mt-3 overflow-hidden rounded-lg border bg-muted/40">
      {/* Annoncé une seule fois : le décompte visible est masqué aux lecteurs
          d'écran, sans quoi la barre réciterait chaque seconde par-dessus la
          relecture du message. */}
      <p className="sr-only">
        {reply.isPrivate ? "Note" : "Réponse"} en attente d&apos;envoi pendant{" "}
        {Math.round(reply.delayMs / 1000)} secondes. Échap pour annuler,{" "}
        {modifier ?? "Ctrl"} + Entrée pour envoyer tout de suite.
      </p>

      {/* La jauge se vide en un seul mouvement, réglé sur la durée exacte de la
          fenêtre : elle n'est pas rendue à nouveau à chaque battement du
          décompte, et ne saute donc pas d'un quart de seconde à l'autre. */}
      <div aria-hidden className="h-1 bg-border/60">
        <div
          className="reply-countdown h-full origin-left bg-primary"
          style={{ animationDuration: `${reply.delayMs}ms` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <p aria-hidden className="inline-flex items-center gap-2 text-sm">
          <Timer className="size-4 shrink-0 text-muted-foreground" />
          <span>
            {/* Chiffres à chasse fixe : sans eux, la ligne entière glisse d'un
                pixel à chaque seconde qui passe. */}
            <span className="font-medium tabular-nums">{seconds}&nbsp;s</span>
            <span className="text-muted-foreground">
              {" "}
              avant {reply.isPrivate ? "l'ajout de la note" : "l'envoi"} — le temps de se
              relire.
            </span>
          </span>
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            title="Annuler l'envoi et reprendre la rédaction"
          >
            <Pencil />
            Modifier
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            title="Renoncer à l'envoi — le message reste dans le champ"
          >
            <Undo2 />
            Annuler
            <Kbd data-icon="inline-end">Échap</Kbd>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSendNow}
            title={`Envoyer sans attendre (${shortcutTitle(modifier, "Entrée")})`}
          >
            <Send />
            Envoyer maintenant
            {modifier && <Kbd data-icon="inline-end">{modifier} ↵</Kbd>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * L'événement vient-il de la surface d'écriture — le champ de note, ou le
 * document de l'éditeur riche ?
 *
 * C'est ce qui autorise Tab à changer de rôle. Ailleurs dans le formulaire (les
 * boutons de mode, l'assistant, l'envoi), Tab doit rester ce qu'il est partout :
 * la façon d'atteindre la commande suivante.
 */
function isWritingSurface(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * L'IA travaille : le champ est pris, et ça se voit.
 *
 * Posé SUR la zone de saisie, à l'endroit exact où le texte va changer. C'est ce
 * qui distingue une attente d'un blocage : sans lui, le champ devient
 * simplement insensible au clavier, et la seule explication se trouve dans un
 * bouton, à l'autre bout du bloc, en petit.
 *
 * Le voile est léger et le texte reste lisible dessous : ce n'est pas un écran
 * de chargement, c'est le message en train d'être relu.
 */
function AiWorkingOverlay({ busy, isRewrite }: { busy: boolean; isRewrite: boolean }) {
  if (!busy) return null;

  return (
    <div
      // Décoratif : l'état est déjà annoncé par le bouton, qui porte le libellé
      // « Réécriture… » et reste le point de référence des lecteurs d'écran.
      aria-hidden
      className="absolute inset-0 z-10 grid place-items-center bg-background/55 backdrop-blur-[1px]"
    >
      <p className="inline-flex animate-pulse items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
        <Wand2 className="size-3.5 text-primary" />
        {isRewrite ? "L'IA reprend votre message…" : "L'IA rédige un brouillon…"}
      </p>
    </div>
  );
}

/**
 * Ce que l'IA vient de poser dans le champ, et la porte de sortie.
 *
 * Le retour en arrière est proposé à CÔTÉ du texte produit, pas seulement dans
 * l'historique de l'éditeur : l'agent qui découvre une réécriture ratée cherche
 * un bouton, pas un raccourci. Et il le cherche tout de suite — d'où une seule
 * ligne, sous les yeux, plutôt qu'une notification qui aurait déjà disparu.
 */
function AiEditNotice({
  label,
  previousWasEmpty,
  onUndo,
}: {
  label: string;
  /** Le champ était vide avant : « revenir à ma version » n'aurait aucun sens. */
  previousWasEmpty: boolean;
  onUndo: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Wand2 className="size-3.5 shrink-0 text-primary" />
      <span>
        Retouché par l&apos;IA{" "}
        <span className="font-medium text-foreground">« {label} »</span>, à relire avant
        l&apos;envoi.
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="underline underline-offset-2 hover:text-foreground"
      >
        {previousWasEmpty ? "Effacer" : "Revenir à ma version"}
      </button>
    </p>
  );
}

/**
 * Le brouillon vient d'une réponse prédéfinie : dit laquelle, et permet de le
 * jeter d'un clic.
 *
 * Un texte qui apparaît sans qu'on l'ait demandé doit s'expliquer, sinon il se
 * fait envoyer sans être relu — ou pire, l'agent le prend pour un reste
 * d'édition sur un autre ticket. Mais ça reste une note de bas de page : une
 * seule ligne au-dessus du champ, pas un encadré qui pèse plus lourd que le
 * message lui-même.
 */
function PrefilledNotice({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Wand2 className="size-3.5 shrink-0" />
      <span>
        Brouillon{" "}
        <span className="font-medium text-foreground">« {title} »</span>, à relire avant
        l&apos;envoi.
      </span>
      <button
        type="button"
        onClick={onClear}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Effacer
      </button>
    </p>
  );
}

/**
 * Le brouillon retrouvé à l'ouverture du ticket.
 *
 * L'annonce vaut autant que la restauration elle-même : sans elle, l'agent
 * découvre un texte dans le champ et doit deviner s'il l'a écrit, si un collègue
 * l'a laissé là, ou si l'application l'a proposé. La possibilité de le jeter
 * d'un clic fait partie de la même idée — un brouillon restauré qu'on ne peut
 * pas écarter devient un texte à effacer à la main avant d'écrire.
 */
function RestoredDraftNotice({
  savedAt,
  onDiscard,
}: {
  savedAt: number | null;
  onDiscard: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Save className="size-3.5 shrink-0" />
      <span>
        Brouillon retrouvé{savedAt ? ` (${formatDraftTime(savedAt)})` : ""}, à relire avant
        l&apos;envoi.
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Repartir de zéro
      </button>
    </p>
  );
}

/**
 * L'heure du dernier enregistrement automatique, sous le champ.
 *
 * Une seule ligne, discrète, mais elle n'est pas décorative : elle est la seule
 * preuve que le texte survivra à un changement de page. Sans elle, un agent
 * prudent recopie sa réponse ailleurs avant d'aller vérifier une information —
 * ce que la sauvegarde était censée lui épargner.
 *
 * « Ce navigateur » est dit explicitement : le brouillon ne suit pas l'agent d'un
 * poste à l'autre, et laisser croire le contraire coûterait un texte perdu le
 * jour où il rouvre le ticket depuis chez lui.
 */
function DraftStatus({ savedAt }: { savedAt: number | null }) {
  if (savedAt === null) return null;

  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Save className="size-3.5 shrink-0" />
      Brouillon enregistré à {formatDraftTime(savedAt)} sur ce navigateur
    </p>
  );
}

function formatDraftTime(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(timestamp)
  );
}

/**
 * La signature, repliée par défaut.
 *
 * Ce qu'il faut savoir en écrivant, c'est QU'IL Y EN A une et laquelle — pas à
 * quoi elle ressemble, elle ne change jamais. Dépliée en permanence, elle
 * occupait plus de hauteur que la zone de rédaction (logo compris) et repoussait
 * le bouton d'envoi hors de l'écran.
 */
function SignatureDisclosure({
  agentName,
  children,
}: {
  agentName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 hover:text-foreground"
      >
        <PenLine className="size-3.5 shrink-0" />
        {/* Espaces explicites autour du nom : une espace laissée en fin de ligne
            JSX est supprimée à la compilation, et « MEILLERajoutée » se
            recollait. Le reste de la phrase tient donc sur une seule ligne. */}
        <span>
          Signature de{" "}
          <span className="font-medium text-foreground">{agentName}</span>{" "}
          ajoutée à l&apos;email
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {/* Hauteur bornée : une signature avec un grand logo ne doit pas reprendre
          tout l'espace qu'on vient de lui retirer. */}
      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-dashed bg-background/60 px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * La ligne d'état sous le champ, réduite à ce qui n'est pas déjà écrit ailleurs.
 *
 * En réponse publique, le nom de l'agent figure déjà sur la ligne de signature :
 * le répéter ici ne servait qu'à occuper une ligne. Il ne reste donc que ce qui
 * s'apprend nulle part ailleurs — la validation à venir, ou le rappel des
 * mentions sur une note.
 */
function metaLine({
  isPrivate,
  currentAgentName,
  requiresApproval,
}: {
  isPrivate: boolean;
  currentAgentName: string;
  requiresApproval: boolean;
}) {
  if (isPrivate) {
    return `Note signée par ${currentAgentName} · tapez @ pour notifier un collègue`;
  }
  if (requiresApproval) {
    return "Soumise à validation par un agent habilité avant l'envoi.";
  }
  return "";
}

/**
 * Qui recevra ce qu'on est en train d'écrire, annoncé au-dessus du champ.
 *
 * Le compte des doublons figure ici et pas seulement dans la confirmation
 * d'envoi : on ne rédige pas de la même façon pour une personne et pour cinq,
 * et l'apprendre après coup est trop tard.
 */
function recipientLine({
  isPrivate,
  clientEmail,
  mergedRecipientCount,
}: {
  isPrivate: boolean;
  clientEmail: string | null;
  mergedRecipientCount: number;
}) {
  if (isPrivate) return "Visible par l'équipe seulement";

  const count = mergedRecipientCount;
  const mergedPart = `${count} client${plural(count)} de ticket${plural(count)} fusionné${plural(
    count
  )}`;

  if (clientEmail && count === 0) return `Destinataire : ${clientEmail}`;
  if (clientEmail) return `Destinataire : ${clientEmail} + ${mergedPart}`;
  if (count > 0) return `Destinataires : ${mergedPart}`;
  return "Aucun client rattaché — rien ne partira par email";
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

/**
 * Dit à l'agent ce que la coche du bouton ne dit pas.
 *
 * Le cas nominal — une réponse partie à un client — ne produit plus de
 * notification : elle serait la répétition de ce que le bouton vient d'annoncer.
 * Ne restent ici que les envois qui ne se sont PAS passés comme prévu, ou pas
 * comme on croit : une validation à obtenir, un email non parti, ou plusieurs
 * destinataires là où on n'en visait qu'un.
 *
 * C'est ce tri qui rend les notifications restantes crédibles. À cinquante
 * réponses par jour, une bannière verte systématique s'ignore — et emporte avec
 * elle les avertissements qui, eux, demandaient une action.
 *
 * Le nombre de clients servis est annoncé explicitement : après une fusion, la
 * réponse part aussi aux clients des doublons, et un simple « envoyée par
 * email » laisserait croire qu'une seule personne l'a reçue.
 */
function announceReply(result: ReplyOutcome) {
  if (result.pendingApproval) {
    toast.info("Réponse envoyée pour validation, en attente d'un agent habilité.");
    return;
  }

  const extra = result.alsoSentTo;

  if (result.emailSent) {
    // Cas courant, et le seul qui n'annonce rien : la coche du bouton dit déjà
    // que la réponse est partie. Une notification de plus par envoi, cinquante
    // fois par jour, finit par se fermer sans être lue — y compris celles qui,
    // plus bas, signalent un vrai problème.
    if (extra === 0) return;
    toast.success(
      `Réponse envoyée par email · ${extra} client${plural(extra)} de ticket${plural(
        extra
      )} fusionné${plural(extra)} également`
    );
    return;
  }

  // Aucun client sur ce ticket, mais des doublons rattachés : la réponse est
  // bien partie, il ne faut pas l'annoncer comme un échec.
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

/**
 * La copie du message, posée sur le champ qu'elle quitte.
 *
 * Purement décoratif — le vrai texte est déjà parti au serveur — donc masqué aux
 * lecteurs d'écran et insensible au pointeur. Le fond opaque est laissé au point
 * d'appel, parce qu'il dépend du champ recouvert, mais il n'est jamais
 * facultatif : sans lui, l'invite du champ vidé (« Écrire la réponse… »)
 * transparaîtrait à travers le texte qui s'élève.
 *
 * `overflow-hidden` borne le calque à la hauteur du champ : une réponse de
 * trente lignes ne doit pas déborder sur la signature et le bouton en montant.
 */
function MessageGhost({
  className,
  children,
}: {
  className?: string;
  /** `null` quand rien n'est en vol : le calque n'existe alors pas du tout. */
  children: string | null;
}) {
  if (children === null) return null;

  return (
    <p
      aria-hidden
      className={cn(
        "reply-lift pointer-events-none absolute inset-0 overflow-hidden text-sm leading-relaxed whitespace-pre-wrap",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * L'avion, et la coche qui prend sa place le temps de la confirmation.
 *
 * Les deux icônes occupent la MÊME case de grille, superposées : c'est ce qui
 * permet de les échanger sans que le libellé à côté ne bouge d'un pixel. Une
 * icône montée puis démontée aurait fait sauter le bouton à chaque envoi —
 * cinquante fois par jour, c'est le genre de secousse qu'on finit par voir plus
 * que l'animation elle-même.
 */
function SendIcon({ phase }: { phase: SendPhase }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <Send className={cn("size-4 col-start-1 row-start-1", planeClass(phase))} />
      {(phase === "sent" || phase === "returning") && (
        <Check
          className={cn(
            "size-4 col-start-1 row-start-1",
            phase === "sent" ? "reply-check-in" : "reply-check-out"
          )}
        />
      )}
    </span>
  );
}

/**
 * Animation portée par l'avion. La classe est la même en `sending` et en
 * `sent`, et ce n'est pas un raccourci : une classe inchangée ne relance pas
 * l'animation, l'avion reste donc simplement sorti pendant que la coche occupe
 * la case, au lieu de redécoller au retour du serveur.
 */
function planeClass(phase: SendPhase) {
  if (phase === "sending" || phase === "sent") return "reply-plane-depart";
  if (phase === "returning" || phase === "aborting") return "reply-plane-return";
  return "";
}

/**
 * Libellé du bouton d'envoi.
 *
 * Les trois libellés possibles sont rendus l'un sur l'autre dans la même case de
 * grille, et non échangés : le bouton prend ainsi la largeur du plus long une
 * fois pour toutes. Sans cela, « Envoyer » → « Envoi… » → « Envoyé » redimensionne
 * le bouton à chaque étape, et les boutons voisins glissent avec lui.
 */
function SendLabel({
  phase,
  isPrivate,
  requiresApproval,
}: {
  phase: SendPhase;
  isPrivate: boolean;
  requiresApproval: boolean;
}) {
  const rest = isPrivate
    ? "Ajouter la note"
    : requiresApproval
      ? "Envoyer pour validation"
      : "Envoyer";
  const busy = isPrivate ? "Ajout…" : "Envoi…";
  const done = isPrivate ? "Note ajoutée" : requiresApproval ? "Transmise" : "Envoyé";

  // Le retour au repos se fait dès `returning` : le libellé et l'icône
  // redeviennent disponibles ensemble, plutôt qu'un texte encore triomphant
  // au-dessus d'une coche déjà en train de s'effacer.
  let active = rest;
  if (phase === "sending") active = busy;
  else if (phase === "sent") active = done;

  return (
    <span className="grid">
      {[rest, busy, done].map((label, index) => (
        <span
          key={index}
          // Les libellés inactifs restent dans le document pour tenir la
          // largeur : masqués aux lecteurs d'écran, le nom accessible du bouton
          // reste celui qu'on voit.
          aria-hidden={label !== active}
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-300",
            label === active ? "opacity-100" : "opacity-0"
          )}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function ModeButton({
  selected,
  onSelect,
  icon,
  label,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
        selected
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
