"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Lock, PenLine, Reply, Send, Sparkles, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addTicketMessage } from "@/lib/actions/tickets";
import { cn, plural } from "@/lib/utils";
import { MentionTextarea } from "@/components/tickets/ticket-detail/mention-textarea";
import { CannedResponsePicker } from "@/components/tickets/ticket-detail/canned-response-picker";
import type { MentionableAgent } from "@/lib/mentions";
import type { TicketCannedResponses } from "@/lib/canned-responses";

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
  cannedResponses,
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
  /**
   * Réponses type qui concernent ce ticket, variables déjà remplies (voir
   * /settings/canned-responses) : celles proposées dans la liste, et celle qui
   * pré-remplit le champ s'il en existe une.
   */
  cannedResponses: TicketCannedResponses;
}) {
  const router = useRouter();
  const autoInserted = cannedResponses.autoInserted;
  // Le pré-remplissage est un état INITIAL, pas une valeur imposée : dès ce
  // premier rendu, le texte appartient à l'agent, qui le réécrit ou l'efface
  // sans que rien ne le remette. La page du ticket monte une zone de rédaction
  // neuve par dossier (voir la clé posée sur `ReplyBox`), c'est donc bien à
  // chaque ouverture de ticket que le brouillon est proposé.
  const [content, setContent] = useState(autoInserted?.body ?? "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [planePhase, setPlanePhase] = useState<PlanePhase>("idle");
  // Copie du message pendant son vol : le champ est vidé dès le clic, c'est
  // cette copie qui s'envole par-dessus.
  const [messageInFlight, setMessageInFlight] = useState<string | null>(null);

  const isEmpty = !content.trim();
  const status = metaLine({ isPrivate, currentAgentName, requiresApproval });

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

  /**
   * Insère une réponse type dans le champ.
   *
   * Le texte déjà écrit n'est jamais remplacé : la réponse type s'ajoute à la
   * suite, séparée d'une ligne vide. Écraser une phrase en cours de rédaction
   * pour un clic sur la mauvaise ligne de la liste serait un coût sans retour.
   */
  function handleInsertCannedResponse(body: string) {
    if (isEmpty) {
      setContent(body);
      return;
    }
    setContent(`${content.trimEnd()}\n\n${body}`);
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

      <div className="space-y-2 p-3">
        {/* Pourquoi il y a déjà du texte dans le champ. L'avis disparaît à la
            première frappe : passé ce point le brouillon est celui de l'agent,
            continuer à l'attribuer à une réponse type serait faux. */}
        {!isPrivate && autoInserted && content === autoInserted.body && (
          <PrefilledNotice title={autoInserted.title} onClear={() => setContent("")} />
        )}

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
              rows={6}
            />
          ) : (
            <Textarea
              placeholder="Écrire la réponse…"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={6}
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
          <SignatureDisclosure agentName={currentAgentName}>{signature}</SignatureDisclosure>
        )}

        {/* La ligne d'état peut être vide (cas courant) : `ml-auto` sur les
            actions les garde alors à droite, sans paragraphe fantôme pour tenir
            la place. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {status && <p className="text-xs text-muted-foreground">{status}</p>}

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
