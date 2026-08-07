import { Paperclip, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { TicketAttachment } from "@/lib/actions/tickets";
import { cn } from "@/lib/utils";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${Math.round(bytes / 1024)} Ko`;
}

/**
 * État de l'analyse antivirus, rendu à côté de chaque pièce jointe.
 *
 * L'état sain est affiché, et pas seulement les anomalies : sans repère
 * visible, un agent ne peut pas distinguer « vérifié » de « pas encore
 * d'antivirus branché ». C'est justement cette ambiguïté qu'on veut lever, donc
 * la coche reste discrète mais présente.
 */
const SCAN_DISPLAY = {
  CLEAN: {
    Icon: ShieldCheck,
    label: "Analysé par l'antivirus",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  PENDING: {
    Icon: ShieldQuestion,
    label: "Analyse antivirus en attente",
    className: "text-amber-600 dark:text-amber-400",
  },
  INFECTED: {
    Icon: ShieldAlert,
    label: "Mis en quarantaine par l'antivirus",
    className: "text-destructive",
  },
} as const;

function ScanBadge({ status }: { status: TicketAttachment["scanStatus"] }) {
  const { Icon, label, className } = SCAN_DISPLAY[status];
  return (
    // Le libellé n'est pas seulement dans `title` : une infobulle native est
    // hors de portée au clavier et sur mobile. `sr-only` le rend disponible aux
    // lecteurs d'écran, l'icône seule ne portant aucun sens.
    <span className={cn("flex items-center", className)} title={label}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AttachmentsList({ attachments }: { attachments: TicketAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
      {attachments.map((attachment) => {
        const quarantined = attachment.scanStatus === "INFECTED";

        const content = (
          <>
            <Paperclip className="size-4 shrink-0" aria-hidden />
            <span className={quarantined ? "line-through" : undefined}>{attachment.filename}</span>
            <span className="text-muted-foreground/60">{formatSize(attachment.size)}</span>
            <ScanBadge status={attachment.scanStatus} />
          </>
        );

        // Une pièce en quarantaine n'est plus un lien : ses octets ont été
        // purgés et /api/attachments/[id] répond 403. Laisser le lien actif
        // enverrait l'agent sur une erreur brute pour toute explication.
        return quarantined ? (
          <div
            key={attachment.id}
            className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"
          >
            {content}
          </div>
        ) : (
          <a
            key={attachment.id}
            href={`/api/attachments/${attachment.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
