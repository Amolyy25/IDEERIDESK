import Link from "next/link";
import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";
import { getAuditLog, getAuditActors } from "@/lib/actions/audit-log";
import { AuditToolbar } from "@/components/audit/audit-toolbar";
import { AuditTable } from "@/components/audit/audit-table";
import { TablePagination } from "@/components/tickets/table-pagination";

/**
 * Journal d'audit : qui a consulté, répondu, modifié — et quand.
 *
 * Les tickets portent déjà un fil de conversation, mais rien ne disait qui avait
 * ouvert un dossier sans y toucher, qui avait déplacé un statut, ni pourquoi un
 * client n'avait jamais reçu une réponse pourtant visible dans le fil. Ce sont
 * les trois questions auxquelles cette page répond.
 */

type SearchParams = Promise<{
  page?: string;
  search?: string;
  actorId?: string;
  family?: string;
  action?: string;
  from?: string;
  to?: string;
}>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  // La donnée est protégée par « audit.view » dans les actions — pas par cette
  // garde, qui ne protège que l'affichage.
  const [session, params] = await Promise.all([requirePageAccess("audit.view"), searchParams]);

  const page = Number(params.page ?? "1") || 1;

  const [{ entries, total, pageSize }, actors] = await Promise.all([
    getAuditLog({
      page,
      search: params.search,
      actorId: params.actorId,
      family: params.family,
      action: params.action,
      from: params.from,
      to: params.to,
    }),
    getAuditActors(),
  ]);

  const pageCount = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-muted/20 p-6">
      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          Consultations, réponses et modifications de tickets, par agent et par date. Le journal est
          en écriture seule : aucune entrée ne peut être corrigée ni effacée depuis
          l&apos;application.
        </p>
        {/* Le journal est l'écran où l'on se trouve quand la question devient
            « et si cette personne demande l'effacement de ses données ? ». Le
            renvoi est posé ici pour cette raison, et seulement pour qui peut
            réellement traiter la demande. */}
        {can(session.user.permissions, "privacy.manage") && (
          <p className="pt-1 text-sm text-muted-foreground">
            Une demande d&apos;accès ou d&apos;effacement à traiter ?{" "}
            <Link href="/privacy" className="text-primary underline">
              Données personnelles
            </Link>
          </p>
        )}
      </div>

      {/* Même cadre que la file de tickets : filtres, données et pagination dans
          une seule carte qui défile sur elle-même, ce qui garde la pagination
          visible quelle que soit la longueur du journal. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-xs">
        <AuditToolbar actors={actors} />

        <div className="min-h-0 flex-1 overflow-auto">
          <AuditTable entries={entries} />
        </div>

        <TablePagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          emptyLabel="Aucune entrée"
        />
      </div>
    </div>
  );
}
