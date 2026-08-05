"use client";

import Link from "next/link";
import { ArrowRight, Eye, PencilLine, MessageSquare } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format-date";
import { RelativeTime } from "@/components/tickets/relative-time";
import { initials } from "@/lib/utils";
import {
  auditActionFamily,
  auditActionLabel,
  parseAuditChanges,
  type AuditFamily,
} from "@/lib/audit-actions";
import type { AuditLogEntry } from "@/lib/audit-query";

/**
 * Le journal, une ligne par geste : QUAND, QUI, QUOI, sur quel ticket.
 *
 * L'ordre des colonnes suit cette lecture. La date est en premier parce qu'un
 * journal se parcourt chronologiquement — c'est la colonne sur laquelle l'œil
 * revient entre deux lignes.
 */

const FAMILY_STYLE: Record<
  AuditFamily,
  { icon: typeof Eye; badge: string; label: string }
> = {
  // Trois natures, trois traitements visuels distincts : dans un journal mêlant
  // des centaines de consultations à quelques modifications, c'est ce contraste
  // qui permet de repérer les secondes sans lire chaque ligne.
  CONSULTATION: {
    icon: Eye,
    badge: "bg-muted text-muted-foreground",
    label: "Consultation",
  },
  REPONSE: {
    icon: MessageSquare,
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    label: "Réponse",
  },
  MODIFICATION: {
    icon: PencilLine,
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Modification",
  },
};

function ActionCell({ action }: { action: AuditLogEntry["action"] }) {
  const family = auditActionFamily(action);
  const style = FAMILY_STYLE[family];
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="ghost" className={style.badge} title={style.label}>
        <Icon aria-hidden />
        {auditActionLabel(action)}
      </Badge>
    </div>
  );
}

/** Le ticket visé, cliquable — sauf s'il a été supprimé depuis. */
function TicketCell({ entry }: { entry: AuditLogEntry }) {
  if (entry.ticketNumber === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const label = (
    <>
      <span className="font-medium tabular-nums">#{entry.ticketNumber}</span>
      {entry.ticketSubject && (
        <span className="block max-w-[22rem] truncate text-xs text-muted-foreground">
          {entry.ticketSubject}
        </span>
      )}
    </>
  );

  // `ticketId` à null = ticket supprimé depuis (voir `onDelete: SetNull`). La
  // ligne reste, le lien disparaît : proposer un lien mort serait pire que de ne
  // rien proposer.
  if (!entry.ticketId) {
    return (
      <div className="text-muted-foreground" title="Ticket supprimé depuis">
        <span className="line-through">{label}</span>
      </div>
    );
  }

  return (
    <Link href={`/tickets/${entry.ticketId}`} className="block hover:underline">
      {label}
    </Link>
  );
}

/** Le « quoi » détaillé : le différentiel s'il existe, la précision sinon. */
function DetailCell({ entry }: { entry: AuditLogEntry }) {
  const changes = parseAuditChanges(entry.changes);

  if (changes.length > 0) {
    return (
      <ul className="space-y-0.5">
        {changes.map((change) => (
          <li key={change.label} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{change.label}</span>
            {change.from !== undefined && change.to !== undefined && (
              <>
                <span className="text-muted-foreground/70 line-through">{change.from}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground/70" aria-label="devient" />
                <span className="font-medium text-foreground">{change.to}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (entry.summary) {
    return <span className="text-xs text-muted-foreground">{entry.summary}</span>;
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}

export function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead className="w-44">Quand</TableHead>
          <TableHead className="w-56">Qui</TableHead>
          <TableHead className="w-52">Action</TableHead>
          <TableHead className="w-64">Ticket</TableHead>
          <TableHead>Détail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
              Aucune entrée ne correspond à ces filtres.
            </TableCell>
          </TableRow>
        ) : (
          entries.map((entry) => (
            <TableRow key={entry.id} className="align-top">
              {/* L'heure exacte, et le relatif en dessous : « il y a 3 minutes »
                  situe l'événement d'un coup d'œil, la date complète est celle
                  qu'on recopie dans un rapport. `RelativeTime` plutôt qu'un appel
                  direct au formateur : le relatif dépend de l'heure courante,
                  donc diffère entre le rendu serveur et l'hydratation. */}
              <TableCell className="whitespace-nowrap">
                <span className="text-sm tabular-nums">{formatDateTime(entry.createdAt)}</span>
                <RelativeTime
                  date={entry.createdAt}
                  className="block text-xs text-muted-foreground"
                />
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {initials(entry.actorName)}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.actorName}</span>
                    {entry.actorEmail && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.actorEmail}
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <ActionCell action={entry.action} />
              </TableCell>

              <TableCell>
                <TicketCell entry={entry} />
              </TableCell>

              <TableCell>
                <DetailCell entry={entry} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
