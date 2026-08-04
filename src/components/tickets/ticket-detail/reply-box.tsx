"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Reply, Send, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn, plural } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import type { MentionableAgent } from "@/lib/mentions";

/**
 * Durées du vol de l'avion, en millisecondes. Elles doivent rester alignées sur
 * les animations `send-plane-*` de globals.css : c'est un minuteur, et non la fin
 * de l'animation, qui fait avancer les étapes — sous `prefers-reduced-motion`
 * l'animation n'existe pas et `animationend` ne se déclencherait jamais.
 */
const PLANE_FLIGHT_MS = 560;
const PLANE_RETURN_MS = 320;

/** Étape du vol : au repos, en train de partir, ou de revenir se poser. */
type PlanePhase = "idle" | "flying" | "landing";

/**
 * Zone de rédaction, en bas du fil : on écrit là où la conversation s'arrête.
 *
 * Les deux modes ne sont pas deux options d'un même envoi mais deux
 * destinataires différents — le client, ou l'équipe. Tout ce qui change entre
 * les deux est donc annoncé : la couleur du bloc, le destinataire au-dessus du
 * champ, le libellé du bouton, et la signature (jointe à un email, absente
 * d'une note).
 */
export function ReplyBox({
  ticketId,
  currentAgentName,
  clientEmail,
  mergedRecipientCount = 0,
  canRespond,
  requiresApproval,
  signature,
  agents,
}: {
  ticketId: string;
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
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [planePhase, setPlanePhase] = useState<PlanePhase>("idle");
  // Copie du message pendant son vol : le champ est vidé dès le clic, c'est
  // cette copie qui s'envole par-dessus.
  const [messageInFlight, setMessageInFlight] = useState<string | null>(null);

  const isEmpty = !content.trim();

  // L'avion part, puis revient se poser. Deux étapes enchaînées par ce seul
  // effet, pour que l'état ne puisse pas rester bloqué « en vol ».
  useEffect(() => {
    if (planePhase === "idle") return;

    let duration = PLANE_RETURN_MS;
    let nextPhase: PlanePhase = "idle";
    if (planePhase === "flying") {
      duration = PLANE_FLIGHT_MS;
      nextPhase = "landing";
    }

    const timer = setTimeout(() => {
      setPlanePhase(nextPhase);
      if (nextPhase === "landing") {
        setMessageInFlight(null);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [planePhase]);

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
      setContent(result.suggestion);
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

    const sentContent = content;
    setIsSubmitting(true);
    // Le champ se vide et le message décolle immédiatement : l'aller-retour
    // serveur se joue pendant le vol, au lieu de laisser le texte figé dans le
    // champ en attendant la réponse. En cas d'échec, il est rendu tel quel.
    setContent("");
    setMessageInFlight(sentContent);
    setPlanePhase("flying");

    try {
      const result = await addTicketMessage(ticketId, { content: sentContent, isPrivate });

      if (isPrivate && result.mentionedNames.length > 0) {
        const names = result.mentionedNames;
        toast.success(
          `Note ajoutée · ${names.join(", ")} notifié${plural(names.length)} par email`
        );
      }

      if (!isPrivate) {
        announceReply(result);
      }

      router.refresh();
    } catch (error) {
      // Le texte revient dans le champ : un envoi refusé ne doit jamais coûter
      // le message à l'agent.
      setContent(sentContent);
      setPlanePhase("idle");
      setMessageInFlight(null);

      let message = "Impossible d'envoyer le message";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  /** ⌘/Ctrl + Entrée envoie, comme dans un client mail. Entrée seule saute une ligne. */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  }

  if (!canRespond) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Accès en lecture seule — vous ne pouvez pas répondre à ce ticket.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
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

      <div className="space-y-3 p-3">
        <div className="relative">
          {/* L'autocomplétion des mentions n'est montée que sur la note interne :
              un @ dans une réponse publique ne notifie personne, proposer la liste
              de l'équipe y serait un piège. */}
          {isPrivate ? (
            <MentionTextarea
              value={content}
              onChange={setContent}
              agents={agents}
              placeholder="Écrire une note interne… (@ pour mentionner un collègue)"
              rows={4}
            />
          ) : (
            <Textarea
              placeholder="Écrire la réponse…"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              className="bg-background"
            />
          )}

          {/* Le message qui s'envole, posé exactement sur le champ qu'il quitte.
              Purement décoratif — le vrai texte est déjà parti au serveur — donc
              masqué aux lecteurs d'écran et insensible au pointeur. */}
          {messageInFlight !== null && (
            <p
              aria-hidden
              className="send-message-liftoff pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-primary/40 bg-background px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
            >
              {messageInFlight}
            </p>
          )}
        </div>

        {/* Uniquement sur la réponse publique : une note interne ne part pas par
            email, y montrer une signature laisserait croire le contraire. */}
        {!isPrivate && signature && (
          <div className="rounded-md border border-dashed bg-background/60 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Signature ajoutée à l&apos;email
            </p>
            {signature}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isPrivate ? "Note signée" : "Réponse envoyée"} par{" "}
            <span className="font-medium text-foreground">{currentAgentName}</span>
            {!isPrivate && requiresApproval && " · soumise à validation"}
            {isPrivate && " · tapez @ pour notifier un collègue"}
          </p>

          <div className="flex items-center gap-2">
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
              // Le raccourci n'est branché que sur la réponse publique : la note
              // interne a son propre traitement du clavier pour les mentions.
              title={isPrivate ? undefined : "⌘ / Ctrl + Entrée"}
            >
              <Send className={planeClass(planePhase)} />
              {sendLabel({ isSubmitting, isPrivate, requiresApproval })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
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
};

/**
 * Dit à l'agent ce qui vient réellement de partir.
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
    if (extra === 0) {
      toast.success("Réponse envoyée par email");
      return;
    }
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
 * Animation portée par l'avion du bouton. `size-4` reste posé par le bouton
 * lui-même : ici on ne décide que du mouvement.
 */
function planeClass(phase: PlanePhase) {
  if (phase === "flying") return "send-plane-takeoff";
  if (phase === "landing") return "send-plane-return";
  return "";
}

/**
 * Libellé du bouton d'envoi. Sorti du JSX : trois conditions imbriquées dans
 * l'attribut se relisaient mal.
 */
function sendLabel({
  isSubmitting,
  isPrivate,
  requiresApproval,
}: {
  isSubmitting: boolean;
  isPrivate: boolean;
  requiresApproval: boolean;
}) {
  if (isSubmitting) return "Envoi…";
  if (isPrivate) return "Ajouter la note";
  if (requiresApproval) return "Envoyer pour validation";
  return "Envoyer";
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
