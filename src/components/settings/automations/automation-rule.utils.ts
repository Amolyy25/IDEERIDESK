import type { TicketPriority } from "@/generated/prisma/client";
import { formatSlaTarget } from "@/lib/sla";

/** Priorités du filtre, dans l'ordre de la liste de réglages. */
export function rulePriorities(priorityIds: string[], priorities: TicketPriority[]) {
  return priorities.filter((priority) => priorityIds.includes(priority.id));
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ou ${names[names.length - 1]}`;
}

/** Récapitulatif en une phrase, pour relire la règle sans recroiser quatre champs. */
export function describeRule({
  triggerStatusName,
  priorityNames,
  delayMinutes,
  actionStatusName,
}: {
  triggerStatusName?: string;
  priorityNames: string[];
  delayMinutes: number;
  actionStatusName?: string;
}) {
  if (!triggerStatusName || !actionStatusName) return null;

  const scope =
    priorityNames.length > 0 ? ` en priorité ${joinNames(priorityNames)}` : ", toutes priorités";

  return `Un ticket « ${triggerStatusName} »${scope} sans activité depuis ${formatSlaTarget(delayMinutes)} passe en « ${actionStatusName} ».`;
}
