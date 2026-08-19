import { plural } from "@/lib/utils";

// Ce que la suppression d'un statut, d'une priorité ou d'un produit va faire. Le
// même objet sert au dialogue de confirmation et à la garde de l'action : l'écran
// ne peut donc pas annoncer autre chose que ce qui sera fait. Les phrases sont
// construites ici, et affichées telles quelles.
export type DeletionImpact = {
  /** Vide = suppression possible. Sinon, ce qui l'empêche. */
  blockers: string[];
  /** Ce que la suppression déplace, en une phrase. `null` si aucun ticket n'est concerné. */
  summary: string | null;
  /** Effets à annoncer, qui n'empêchent pas la suppression. */
  warnings: string[];
  ticketCount: number;
  /** Valeur de reprise des tickets ; `null` quand ils perdent simplement l'attribut. */
  fallbackId: string | null;
};

type StatusRow = {
  id: string;
  name: string;
  isDefault: boolean;
  isClosed: boolean;
  isCloseDefault: boolean;
  isInProgressDefault: boolean;
  isReopenDefault: boolean;
};

type NamedRow = { id: string; name: string; isDefault: boolean };

type StatusRule = { name: string; triggerStatusId: string; actionStatusId: string };
type PriorityRule = { name: string; actionPriorityId: string | null; triggerPriorityIds: string[] };
type CategoryRule = { name: string; triggerCategoryIds: string[] };

export function buildStatusImpact({
  status,
  statuses,
  ticketCount,
  rules,
}: {
  status: StatusRow;
  statuses: StatusRow[];
  ticketCount: number;
  rules: StatusRule[];
}): DeletionImpact {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const usedBy = rules
    .filter((rule) => rule.triggerStatusId === status.id || rule.actionStatusId === status.id)
    .map((rule) => rule.name);
  if (usedBy.length > 0) blockers.push(rulesBlocker(usedBy, "ce statut"));

  if (status.isDefault) {
    blockers.push("C'est le statut par défaut : désignez-en un autre avant de supprimer celui-ci.");
  }

  const fallback = statuses.find((other) => other.isDefault && other.id !== status.id) ?? null;
  if (ticketCount > 0 && !fallback) {
    blockers.push(
      `${ticketCount} ticket${plural(ticketCount)} portent ce statut et aucun autre n'est marqué « par défaut » pour les reprendre.`
    );
  }

  const roles = [
    status.isCloseDefault && "clôture",
    status.isInProgressDefault && "prise en charge",
    status.isReopenDefault && "réouverture",
  ].filter(Boolean) as string[];
  if (roles.length > 0) {
    warnings.push(
      `Ce statut sert de cible à : ${roles.join(", ")}. Ces gestes resteront sans statut d'arrivée jusqu'à ce qu'un autre prenne le rôle.`
    );
  }

  if (ticketCount > 0 && fallback && status.isClosed && !fallback.isClosed) {
    warnings.push("Ces tickets clos redeviendront des dossiers ouverts, dans la file.");
  }

  return {
    blockers,
    summary: movedSummary(ticketCount, fallback?.name),
    warnings,
    ticketCount,
    fallbackId: fallback?.id ?? null,
  };
}

export function buildPriorityImpact({
  priority,
  priorities,
  ticketCount,
  rules,
}: {
  priority: NamedRow;
  priorities: NamedRow[];
  ticketCount: number;
  rules: PriorityRule[];
}): DeletionImpact {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const usedBy = rules
    .filter(
      (rule) =>
        rule.actionPriorityId === priority.id || rule.triggerPriorityIds.includes(priority.id)
    )
    .map((rule) => rule.name);
  if (usedBy.length > 0) blockers.push(rulesBlocker(usedBy, "cette priorité"));

  if (priority.isDefault) {
    blockers.push(
      "C'est la priorité par défaut : désignez-en une autre avant de supprimer celle-ci."
    );
  }

  const fallback = priorities.find((other) => other.isDefault && other.id !== priority.id) ?? null;
  if (ticketCount > 0 && !fallback) {
    blockers.push(
      `${ticketCount} ticket${plural(ticketCount)} portent cette priorité et aucune autre n'est marquée « par défaut » pour les reprendre.`
    );
  }

  if (ticketCount > 0 && fallback) {
    warnings.push(
      `Leurs échéances SLA seront recalculées sur les délais de « ${fallback.name} », depuis leur date d'arrivée.`
    );
  }

  return {
    blockers,
    summary: movedSummary(ticketCount, fallback?.name),
    warnings,
    ticketCount,
    fallbackId: fallback?.id ?? null,
  };
}

export function buildCategoryImpact({
  categoryId,
  ticketCount,
  rules,
}: {
  categoryId: string;
  ticketCount: number;
  rules: CategoryRule[];
}): DeletionImpact {
  const blockers: string[] = [];

  const usedBy = rules
    .filter((rule) => rule.triggerCategoryIds.includes(categoryId))
    .map((rule) => rule.name);
  if (usedBy.length > 0) blockers.push(rulesBlocker(usedBy, "ce produit"));

  // Pas de valeur de reprise : le produit est facultatif sur un ticket, et le
  // basculer d'office vers un autre produit ferait dire au dossier une chose
  // fausse. Il est vidé, l'agent le repose s'il le faut.
  return {
    blockers,
    summary:
      ticketCount > 0
        ? `${ticketCount} ticket${plural(ticketCount)} ${ticketCount > 1 ? "n'auront" : "n'aura"} plus de produit concerné.`
        : null,
    warnings: [],
    ticketCount,
    fallbackId: null,
  };
}

function rulesBlocker(names: string[], what: string) {
  const quoted = names.map((name) => `« ${name} »`).join(", ");
  if (names.length === 1) {
    return `L'automatisation ${quoted} s'appuie sur ${what} : modifiez-la avant de le supprimer.`;
  }
  return `${names.length} automatisations s'appuient sur ${what} (${quoted}) : modifiez-les avant de le supprimer.`;
}

function movedSummary(ticketCount: number, fallbackName: string | undefined) {
  if (ticketCount === 0 || !fallbackName) return null;
  const verb = ticketCount > 1 ? "passeront" : "passera";
  return `${ticketCount} ticket${plural(ticketCount)} ${verb} en « ${fallbackName} ».`;
}
