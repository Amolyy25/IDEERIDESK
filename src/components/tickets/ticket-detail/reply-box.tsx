"use client";

import { useModifierKey } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import { CannedResponsePicker } from "@/components/tickets/ticket-detail/canned-response-picker";
import { AiMenu } from "@/components/tickets/ticket-detail/ai-menu";
import { PresenceStrip } from "@/components/tickets/ticket-detail/presence-strip";
import { GameOverCurtain } from "@/components/tickets/ticket-detail/game-over-curtain";
import { QueuedReplyBar } from "@/components/tickets/ticket-detail/queued-reply-bar";
import { ReplyComposerHeader } from "@/components/tickets/ticket-detail/reply-composer-header";
import {
  AiEditNotice,
  DraftStatus,
  PrefilledNotice,
  ReplyingToNotice,
  RestoredDraftNotice,
} from "@/components/tickets/ticket-detail/reply-notices";
import { AiWorkingOverlay, MessageGhost } from "@/components/tickets/ticket-detail/reply-overlays";
import {
  AttachedFiles,
  AttachFilesButton,
  ReplyDropZone,
} from "@/components/tickets/ticket-detail/reply-attachments";
import { SendButton } from "@/components/tickets/ticket-detail/reply-send-button";
import { SignatureDisclosure } from "@/components/tickets/ticket-detail/signature-disclosure";
import { useReplyComposer } from "@/components/tickets/ticket-detail/use-reply-composer";
import {
  useStoredReplyDraft,
  type ReplyDraft,
} from "@/components/tickets/ticket-detail/use-reply-draft";
import { ReplyEditor } from "@/components/editor/reply-editor";
import { isReplyHtmlEmpty } from "@/lib/reply-html";
import type { MentionableAgent } from "@/lib/mentions";
import type { TicketCannedResponses } from "@/lib/canned-responses";

// La clé de remontage porte la restauration : le brouillon local n'arrive qu'après
// l'hydratation, et l'amorcer depuis un effet écraserait ce qui a déjà été tapé.
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
  /** Destinataire de la réponse publique. `null` quand aucun client n'est rattaché. */
  clientEmail: string | null;
  /** Clients des tickets fusionnés qui recevront eux aussi cette réponse. */
  mergedRecipientCount?: number;
  canRespond: boolean;
  requiresApproval: boolean;
  /** Rendue en amont (voir `SignatureBlock`). `null` : aucune configurée, le bloc disparaît. */
  signature: React.ReactNode;
  /** Agents mentionnables en @ dans une note interne. */
  agents: MentionableAgent[];
  /** Réponses type qui concernent ce ticket, variables déjà remplies. */
  cannedResponses: TicketCannedResponses;
  /** Secondes de rattrapage après le clic (Paramètres > Général). `0` : envoi immédiat. */
  sendDelaySeconds: number;
  // Clé API configurée (Paramètres > IA). Faux : l'assistant n'apparaît pas du tout,
  // raccourcis compris — l'agent n'a de toute façon pas accès aux réglages.
  aiEnabled: boolean;
};

// Les deux modes n'ont pas le même destinataire : couleur du bloc, destinataire
// annoncé, libellé du bouton et signature suivent tous `isPrivate`.
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
  const modifier = useModifierKey();
  const composer = useReplyComposer({
    ticketId,
    currentAgentId,
    aiEnabled,
    sendDelaySeconds,
    autoInserted: cannedResponses.autoInserted,
    restoredDraft,
  });

  const { ai, send, shortcuts, isPrivate, isEmpty, isLocked } = composer;
  const queued = send.queued;
  const status = metaLine({ isPrivate, currentAgentName, requiresApproval });

  if (!canRespond) {
    return (
      <div className="space-y-2">
        {/* Montrée même en lecture seule : savoir qu'un collègue rédige explique
            pourquoi il ne faut pas aller le chercher pour ce dossier. */}
        <PresenceStrip others={composer.others} className="rounded-lg border" />
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Accès en lecture seule — vous ne pouvez pas répondre à ce ticket.
        </div>
      </div>
    );
  }

  return (
    <div
      // Les raccourcis sont écoutés sur le formulaire et non sur le document :
      // ⌘ + Entrée n'a de sens qu'en écrivant ici, un écouteur global enverrait la
      // réponse depuis n'importe quel champ de la fiche.
      onKeyDown={shortcuts.handleKeyDown}
      onKeyUp={shortcuts.handleKeyUp}
      className={cn(
        // `relative` porte le rideau du GAME OVER, `overflow-hidden` retient les
        // pixels qui tombent : ils quittent le bloc, pas la page.
        "relative overflow-hidden rounded-lg border transition-colors",
        // Même code couleur que les notes internes du fil : impossible de se
        // tromper sur ce que le client verra.
        isPrivate ? "border-primary/40 bg-primary/5" : "bg-card"
      )}
    >
      <ReplyComposerHeader
        isPrivate={isPrivate}
        onModeChange={composer.setIsPrivate}
        locked={send.isQueued}
        clientEmail={clientEmail}
        mergedRecipientCount={mergedRecipientCount}
      />

      {/* Le dernier endroit que l'œil traverse avant de se poser sur le texte. */}
      <PresenceStrip others={composer.others} className="border-b" />

      {/* Toute la zone de rédaction est une cible de dépôt, et pas seulement une
          bande dédiée : on lâche le fichier là où on l'a amené. */}
      <ReplyDropZone
        className="space-y-2 p-3"
        disabled={isLocked || send.isSubmitting}
        onDrop={composer.attachments.add}
      >
        {isPrivate && composer.replyTarget && (
          <ReplyingToNotice
            author={composer.replyTarget.author}
            excerpt={composer.replyTarget.excerpt}
            onClear={composer.clearReplyTarget}
          />
        )}

        {composer.prefilledTitle && (
          <PrefilledNotice
            title={composer.prefilledTitle}
            onClear={() => composer.setHtml("")}
          />
        )}

        {ai.visibleAiEdit && (
          <AiEditNotice
            label={ai.visibleAiEdit.label}
            previousWasEmpty={
              !ai.visibleAiEdit.previous.trim() || isReplyHtmlEmpty(ai.visibleAiEdit.previous)
            }
            onUndo={ai.undoAiEdit}
          />
        )}

        {composer.draftIntact && (
          <RestoredDraftNotice
            savedAt={restoredDraft?.savedAt ?? null}
            onDiscard={composer.discardDraft}
          />
        )}

        <div className="relative">
          {/* L'autocomplétion des mentions n'est montée que sur la note interne :
              un @ dans une réponse publique ne notifie personne. */}
          {isPrivate ? (
            <>
              <MentionTextarea
                value={composer.note}
                onChange={composer.setNote}
                onSubmit={composer.handleSubmit}
                agents={agents}
                placeholder="Écrire une note interne… (@ pour mentionner un collègue)"
                rows={6}
                disabled={isLocked}
                focusRef={composer.noteFocusRef}
              />
              <AiWorkingOverlay busy={ai.isRewriting} isRewrite />
              {/* Cadre et rembourrage repris du `Textarea` recouvert, pour que ce
                  soit le champ qui semble s'élever. Le fond est volontairement
                  opaque : il doit masquer l'invite du champ vidé. */}
              <MessageGhost className="rounded-lg border border-input bg-background px-3 py-2.5">
                {send.messageInFlight}
              </MessageGhost>
            </>
          ) : (
            <ReplyEditor
              value={composer.html}
              onChange={composer.setHtml}
              onSubmit={composer.handleSubmit}
              placeholder="Écrire la réponse…"
              editable={!isLocked}
              focusRef={composer.editorFocusRef}
              // Confié à l'éditeur plutôt que posé sur ce conteneur : le calque doit
              // couvrir la zone de saisie et pas la barre d'outils, dont la hauteur
              // ne se devine pas d'ici. Rembourrage et fond identiques aux siens,
              // pour que le texte parte d'où il était.
              overlay={
                <>
                  <MessageGhost className="bg-background px-3 py-2">
                    {send.messageInFlight}
                  </MessageGhost>
                  <AiWorkingOverlay
                    busy={ai.isSuggesting || ai.isRewriting}
                    isRewrite={ai.isRewriting}
                  />
                </>
              }
            />
          )}
        </div>

        <AttachedFiles
          files={composer.attachments.files}
          error={composer.attachments.error}
          disabled={isLocked}
          onRemove={composer.attachments.remove}
        />

        {/* Uniquement sur la réponse publique : une note interne ne part pas par
            email, y montrer une signature laisserait croire le contraire. */}
        {!isPrivate && signature && (
          <SignatureDisclosure agentName={currentAgentName}>{signature}</SignatureDisclosure>
        )}

        {/* Pendant l'attente, la barre de rattrapage PREND LA PLACE des actions :
            il n'y a plus qu'une chose à décider, et laisser un « Envoyer »
            cliquable sous un message déjà parti serait la meilleure façon de
            l'envoyer deux fois. */}
        {queued ? (
          <QueuedReplyBar
            reply={queued}
            modifier={modifier}
            onEdit={() => send.resumeEditing(queued)}
            onCancel={send.releaseQueued}
            onSendNow={() => send.flushQueued(queued)}
          />
        ) : (
          /* La ligne d'état peut être vide : `ml-auto` garde alors les actions à
             droite, sans paragraphe fantôme pour tenir la place. */
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {status && <p className="text-xs text-muted-foreground">{status}</p>}
              <DraftStatus savedAt={composer.draftSavedAt} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Ouvert aux deux modes : les fichiers d'une note restent internes,
                  ceux d'une réponse publique partent avec l'email. */}
              <AttachFilesButton
                disabled={isLocked || send.isSubmitting}
                isFull={composer.attachments.isFull}
                onPick={composer.attachments.add}
              />
              {/* Réservé à la réponse publique : une réponse type est écrite pour un
                  client, la proposer sur une note interne n'aurait pas de
                  destinataire. */}
              {!isPrivate && (
                <CannedResponsePicker
                  responses={cannedResponses.available}
                  onInsert={composer.insertCannedResponse}
                />
              )}
              {/* L'assistant change de rôle avec l'état du champ (voir `AiMenu`) :
                  proposer un brouillon quand il n'y a rien, relire sinon. Sur une
                  note interne, seule la réécriture a un sens — d'où le bouton
                  absent tant qu'il n'y a rien à reprendre. */}
              {aiEnabled && (!isPrivate || !isEmpty) && (
                <AiMenu
                  hasText={!isEmpty}
                  canSuggest={!isPrivate}
                  isSuggesting={ai.isSuggesting}
                  isRewriting={ai.isRewriting}
                  disabled={send.isSubmitting}
                  activeIntent={ai.rewriteIntent}
                  modifier={modifier}
                  open={shortcuts.aiMenuOpen}
                  onOpenChange={shortcuts.onAiMenuOpenChange}
                  onSuggest={ai.suggest}
                  onRewrite={ai.rewrite}
                />
              )}
              <SendButton
                phase={send.sendPhase}
                isPrivate={isPrivate}
                requiresApproval={requiresApproval}
                disabled={send.isSubmitting || isEmpty || ai.isRewriting}
                modifier={modifier}
                onClick={composer.handleSubmit}
              />
            </div>
          </div>
        )}
      </ReplyDropZone>

      {/* Posé en dernier et en `z-20` : il recouvre le formulaire entier, bouton
          d'envoi compris. Un rideau qui laisserait le bouton cliquable pendant
          qu'il annonce GAME OVER se ferait traverser. */}
      {composer.gameOverWord !== null && <GameOverCurtain word={composer.gameOverWord} />}
    </div>
  );
}

// Vide en réponse publique sans validation : le nom de l'agent est déjà sur la
// ligne de signature, le répéter n'occuperait qu'une ligne de plus.
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
