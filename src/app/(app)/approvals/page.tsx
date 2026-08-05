import { requirePageAccess } from "@/lib/require-page-access";
import { getPendingApprovalMessages } from "@/lib/actions/tickets";
import { PendingApprovalsList } from "@/components/approvals/pending-approvals-list";

/**
 * File des réponses retenues en attente de validation.
 *
 * Le workflow d'approbation n'avait aucune vue d'ensemble : les réponses en
 * attente n'existaient que sur la fiche du ticket concerné, donc invisibles
 * tant qu'on ne l'ouvrait pas. Le client, lui, attendait.
 */
export default async function ApprovalsPage() {
  // La donnée elle-même est protégée par « approvals.handle » dans l'action,
  // pas par cette garde, qui ne protège que l'affichage.
  await requirePageAccess("approvals.handle");

  const messages = await getPendingApprovalMessages();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Validations</h1>
        <p className="text-sm text-muted-foreground">
          Réponses rédigées par un agent dont les envois nécessitent votre accord. Rien n&apos;est
          parti au client tant qu&apos;une réponse est dans cette liste.
        </p>
      </div>

      <PendingApprovalsList messages={messages} />
    </div>
  );
}
