"use client";

import { Lock, Reply } from "lucide-react";
import { cn, plural } from "@/lib/utils";

// À qui l'on écrit : les deux modes ne sont pas deux options d'un même envoi mais
// deux destinataires, d'où l'adresse annoncée juste à côté de la bascule.
export function ReplyComposerHeader({
  isPrivate,
  onModeChange,
  locked,
  clientEmail,
  mergedRecipientCount,
}: {
  isPrivate: boolean;
  onModeChange: (isPrivate: boolean) => void;
  /** Pendant l'attente d'envoi : changer de destinataire ne changerait rien au message parti. */
  locked: boolean;
  clientEmail: string | null;
  mergedRecipientCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <div className="inline-flex rounded-md border bg-background p-0.5">
        <ModeButton
          selected={!isPrivate}
          onSelect={() => onModeChange(false)}
          disabled={locked}
          icon={<Reply className="size-4" />}
          label="Répondre au client"
        />
        <ModeButton
          selected={isPrivate}
          onSelect={() => onModeChange(true)}
          disabled={locked}
          icon={<Lock className="size-4" />}
          label="Note interne"
        />
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {recipientLine({ isPrivate, clientEmail, mergedRecipientCount })}
      </p>
    </div>
  );
}

// Le compte des doublons est annoncé avant l'écriture et pas seulement à l'envoi :
// on ne rédige pas de la même façon pour une personne et pour cinq.
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
