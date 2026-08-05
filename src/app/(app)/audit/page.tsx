import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
  const [session, params] = await Promise.all([auth(), searchParams]);

  // Redirection et pas 404 : la page existe, elle n'est pas pour cet agent. La
  // donnée, elle, est protégée par `requireAdmin` dans les actions — pas par
  // cette redirection, qui ne protège que l'affichage.
  if (session?.user?.role !== "ADMIN") {
    redirect("/tickets");
  }

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
