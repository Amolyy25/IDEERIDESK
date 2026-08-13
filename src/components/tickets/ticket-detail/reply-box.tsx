"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Lock,
  PenLine,
  Reply,
  Save,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn, plural } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import { CannedResponsePicker } from "@/components/tickets/ticket-detail/canned-response-picker";
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
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  // Copie du message pendant son départ : le champ est vidé dès le clic, c'est
  // cette copie qui monte par-dessus.
  const [messageInFlight, setMessageInFlight] = useState<string | null>(null);
  // Le mot qui vient d'interrompre un envoi, le temps du GAME OVER.
  const [gameOverWord, setGameOverWord] = useState<string | null>(null);
  // Les mots pour lesquels la blague a déjà été faite. Une référence et non un
  // état : rien à l'écran n'en dépend, et la faire entrer dans le rendu ne
  // servirait qu'à en déclencher un de plus.
  const excusedInsults = useRef(new Set<string>());

  const isEmpty = isPrivate ? !note.trim() : isReplyHtmlEmpty(html);
  const status = metaLine({ isPrivate, currentAgentName, requiresApproval });

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
   * Insère une réponse type dans le champ.
   *
   * Le texte déjà écrit n'est jamais remplacé : la réponse type s'ajoute à la
   * suite, en paragraphes à part. Écraser une phrase en cours de rédaction pour
   * un clic sur la mauvaise ligne de la liste serait un coût sans retour.
   */
  function handleInsertCannedResponse(body: string) {
    setHtml(appendReplyHtml(html, textToReplyHtml(body)));
  }

  async function handleSuggest() {
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
      setHtml(textToReplyHtml(result.suggestion));
      toast.success("Suggestion générée");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de générer une suggestion."
      );
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleSubmit() {
    if (isEmpty || isSubmitting) return;

    // Une réponse publique part sous ses deux formes : le HTML pour la mise en
    // forme, sa retranscription pour le client dont la boîte mail n'affiche pas
    // le HTML. Une note interne n'a que du texte.
    const sentHtml = isPrivate ? null : html;
    const sentContent = isPrivate ? note : htmlToText(html);

    // Le contrôle passe AVANT tout le reste : le champ ne se vide pas, le
    // brouillon n'est pas touché, rien ne part au serveur. Ce qui est écrit
    // reste exactement où il est, prêt à être corrigé — ou renvoyé tel quel au
    // clic suivant, car ce n'est pas une interdiction (voir `findInsult`).
    const insult = findInsult(sentContent);
    if (insult && !excusedInsults.current.has(insult)) {
      excusedInsults.current.add(insult);
      setGameOverWord(insult);
      playGameOverJingle();
      return;
    }

    setIsSubmitting(true);
    // Le champ se vide et le message part immédiatement : l'aller-retour serveur
    // se joue pendant la montée, au lieu de laisser le texte figé dans le champ
    // en attendant la réponse. En cas d'échec, il est rendu tel quel.
    if (isPrivate) setNote("");
    else setHtml("");
    setMessageInFlight(sentContent);
    setSendPhase("sending");

    try {
      const result = await addTicketMessage(ticketId, {
        content: sentContent,
        contentHtml: sentHtml ?? undefined,
        isPrivate,
      });

      // Le brouillon a fini son office : le garder ferait réapparaître, à la
      // prochaine ouverture du ticket, une réponse déjà partie au client.
      clearDraft();

      // C'est ici, et pas au clic, que la coche s'installe : elle ne confirme
      // rien tant que le serveur n'a pas répondu.
      setSendPhase("sent");

      if (isPrivate && result.mentionedNames.length > 0) {
        const names = result.mentionedNames;
        toast.success(
          `Note ajoutée · ${names.join(", ")} notifié${plural(names.length)} par email`
        );
      }

      if (!isPrivate) {
        announceReply(result);
        // Annonce distincte, et non fondue dans le message ci-dessus : le ticket
        // vient de changer de main sans que l'agent l'ait demandé. Un changement
        // qu'on n'a pas décidé soi-même doit se voir, sinon il se découvre plus
        // tard dans la file, sans explication.
        if (result.selfAssigned) {
          toast.info("Ticket pris en charge : il vous est maintenant assigné");
        }
      }

      router.refresh();
    } catch (error) {
      // Le texte revient dans le champ, mise en forme comprise : un envoi refusé
      // ne doit jamais coûter le message à l'agent. Le brouillon local, lui, n'a
      // pas été effacé — `clearDraft` n'est atteint qu'en cas de succès.
      if (isPrivate) setNote(sentContent);
      else setHtml(sentHtml ?? "");
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
          <ModeButton
            selected={!isPrivate}
            onSelect={() => setIsPrivate(false)}
            icon={<Reply className="size-4" />}
            label="Répondre au client"
          />
          <ModeButton
            selected={isPrivate}
            onSelect={() => setIsPrivate(true)}
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
                agents={agents}
                placeholder="Écrire une note interne… (@ pour mentionner un collègue)"
                rows={6}
              />
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
              // Confié à l'éditeur plutôt que posé sur ce conteneur : le calque
              // doit couvrir la zone de saisie et pas la barre d'outils, dont la
              // hauteur ne se devine pas d'ici.
              // Rembourrage identique à celui de la zone de saisie : le texte
              // doit partir d'où il était, sans sauter d'abord de quelques
              // pixels. `bg-background` est celui de l'éditeur, à l'identique.
              overlay={
                <MessageGhost className="bg-background px-3 py-2">
                  {messageInFlight}
                </MessageGhost>
              }
            />
          )}
        </div>

        {/* Uniquement sur la réponse publique : une note interne ne part pas par
            email, y montrer une signature laisserait croire le contraire. */}
        {!isPrivate && signature && (
          <SignatureDisclosure agentName={currentAgentName}>{signature}</SignatureDisclosure>
        )}

        {/* La ligne d'état peut être vide (cas courant) : `ml-auto` sur les
            actions les garde alors à droite, sans paragraphe fantôme pour tenir
            la place. */}
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
            {!isPrivate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSuggest}
                disabled={isSuggesting}
              >
                <Sparkles />
                {isSuggesting ? "Génération…" : "Suggérer"}
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || isEmpty}
              size="sm"
              className={cn(
                // Le bouton est inerte pendant toute la séquence — l'envoi est
                // en cours, puis le champ est vide — mais il ne doit pas
                // s'éteindre pour autant : c'est lui qui porte la confirmation,
                // et une coche à moitié effacée annonce mal une réussite.
                sendPhase !== "idle" && "disabled:opacity-100"
              )}
              // Le raccourci n'est branché que sur la réponse publique : la note
              // interne a son propre traitement du clavier pour les mentions.
              title={isPrivate ? undefined : "⌘ / Ctrl + Entrée"}
            >
              <SendIcon phase={sendPhase} />
              <SendLabel
                phase={sendPhase}
                isPrivate={isPrivate}
                requiresApproval={requiresApproval}
              />
            </Button>
          </div>
        </div>
      </div>

      {/* Posé en dernier et en `z-20` : il recouvre le formulaire entier, barre
          de mode et bouton d'envoi compris. Un rideau qui laisserait le bouton
          cliquable pendant qu'il annonce GAME OVER se ferait traverser. */}
      {gameOverWord !== null && <GameOverCurtain word={gameOverWord} />}
    </div>
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
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
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
