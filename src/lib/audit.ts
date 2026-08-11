import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import type { AuditChange } from "@/lib/audit-actions";

/**
 * Écriture du journal d'audit.
 *
 * Deux règles tiennent tout ce fichier :
 *
 * 1. **Le journal ne fait jamais échouer le geste qu'il trace.** Une réponse
 *    partie au client, un ticket clos, une fusion : ce sont des faits accomplis
 *    et souvent irréversibles. Si l'insertion de la trace échoue (base
 *    momentanément indisponible, migration pas encore appliquée), l'agent ne
 *    doit pas voir une erreur pour un geste qui a réussi. D'où le `catch` de
 *    `recordAudit`, qui n'est pas de la négligence mais le comportement voulu.
 *
 * 2. **L'auteur vient de la session, jamais d'un paramètre client.** Comme pour
 *    `Message.agentId` : une trace dont l'appelant choisit l'auteur ne prouve
 *    rien.
 */

/** Identité figée dans la ligne du journal, extraite de la session. */
function actorOf(session: Session) {
  const email = session.user.email ?? "";
  return {
    actorId: session.user.id ?? null,
    actorName: session.user.name || email || "Agent inconnu",
    actorEmail: email,
  };
}

/** Ce que le journal retient d'un ticket, recopié pour survivre à sa suppression. */
export type AuditTicketRef = {
  id: string;
  number: number;
  subject: string;
};

/**
 * Ticket dont le journal garde l'identité mais pas le lien.
 *
 * Un seul cas, et il est essentiel : la trace d'une SUPPRESSION est écrite après
 * le `delete`, donc à un instant où la clé étrangère `audit_logs_ticketId_fkey`
 * refuserait l'identifiant (`onDelete: SetNull` ne dénoue que les lignes déjà
 * présentes, il n'autorise pas d'en insérer de nouvelles vers un ticket disparu).
 * Passer `id: null` est donc la condition pour que la suppression soit
 * journalisable — c'est-à-dire pour que le journal serve à quelque chose.
 */
export type AuditDetachedTicketRef = {
  id: null;
  number: number;
  subject: string;
};

export async function recordAudit({
  session,
  action,
  ticket,
  changes = [],
  summary,
}: {
  session: Session;
  action: AuditAction;
  /** Ticket concerné — absent pour une action qui n'en vise aucun. */
  ticket?: AuditTicketRef | AuditDetachedTicketRef | null;
  /** Différentiel champ par champ, pour une modification. */
  changes?: AuditChange[];
  /** Précision libre, pour une action qui n'est pas un différentiel. */
  summary?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        ...actorOf(session),
        ticketId: ticket?.id ?? null,
        ticketNumber: ticket?.number ?? null,
        ticketSubject: ticket?.subject ?? null,
        changes: changes as unknown as Prisma.InputJsonValue,
        summary: summary ?? null,
      },
    });
  } catch (error) {
    // Volontairement silencieux côté agent, bruyant côté serveur : c'est aux
    // logs d'application de signaler qu'une trace a été perdue.
    console.error("[audit] trace non enregistrée", { action, error });
  }
}

/**
 * Fenêtre pendant laquelle une nouvelle ouverture de la même fiche par le même
 * agent n'est pas re-journalisée.
 *
 * Sans elle, le journal serait illisible : un agent qui travaille une heure sur
 * un ticket y revient dix fois (retour depuis la liste, rechargement après une
 * réponse, `router.refresh()` déclenché par une action). Ces dix lignes
 * n'apprennent rien de plus que la première — « cet agent a consulté ce dossier
 * cet après-midi » — et noieraient les réponses et les modifications.
 *
 * Une fenêtre trop longue, à l'inverse, effacerait des consultations
 * distinctes : trente minutes est un compromis assumé, à la maille d'une session
 * de travail sur un dossier.
 */
const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Journalise l'ouverture d'une fiche, sauf si la même consultation est déjà
 * tracée dans la fenêtre courante.
 */
export async function recordTicketView({
  session,
  ticket,
}: {
  session: Session;
  ticket: AuditTicketRef;
}) {
  const actorId = session.user.id;

  // `actorId` explicitement testé, et non passé tel quel au `where` : un
  // `undefined` y vaut « pas de condition », donc un dédoublonnage sur les
  // consultations de TOUS les agents — la trace du second lecteur d'un ticket
  // disparaîtrait silencieusement. La garde d'appel rend ce cas impossible ;
  // c'est justement pourquoi il ne doit pas dépendre d'elle.
  if (actorId) {
    try {
      const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);
      const alreadyTraced = await prisma.auditLog.findFirst({
        where: {
          action: "TICKET_VIEWED",
          actorId,
          ticketId: ticket.id,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (alreadyTraced) return;
    } catch (error) {
      // Le dédoublonnage a échoué : on trace quand même. Une ligne en trop vaut
      // mieux qu'une consultation absente du journal.
      console.error("[audit] dédoublonnage de consultation impossible", error);
    }
  }

  await recordAudit({ session, action: "TICKET_VIEWED", ticket });
}

// ---------------------------------------------------------------------------
// Différentiel des attributs d'un ticket
// ---------------------------------------------------------------------------

/** Attributs relus avant et après une modification, pour en tirer le « quoi ». */
export const auditTicketSelect = {
  id: true,
  number: true,
  subject: true,
  metadata: true,
  // Brut en plus du nom : l'appelant compare des identifiants (« a-t-il changé
  // de main ? », « le délai SLA à tenir a-t-il changé ? »), le journal affiche
  // des libellés.
  assigneeId: true,
  priorityId: true,
  status: { select: { name: true } },
  priority: { select: { name: true } },
  category: { select: { name: true } },
  assignee: { select: { name: true, email: true } },
} satisfies Prisma.TicketSelect;

export type AuditTicketSnapshot = Prisma.TicketGetPayload<{
  select: typeof auditTicketSelect;
}>;

export function readTicketSnapshot(id: string) {
  return prisma.ticket.findUnique({ where: { id }, select: auditTicketSelect });
}

const NONE = "—";

function agentLabel(assignee: AuditTicketSnapshot["assignee"]) {
  if (!assignee) return "Non assigné";
  return assignee.name || assignee.email;
}

/** Clés de `metadata` dont la valeur a changé entre deux états. */
function changedMetadataKeys(before: unknown, after: unknown): string[] {
  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const previous = asRecord(before);
  const next = asRecord(after);
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  return [...keys]
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
    // Contexte technique déposé par le widget, jamais saisi par un agent : le
    // signaler comme « champ modifié » serait un faux positif.
    .filter((key) => !key.startsWith("_"))
    .sort();
}

/**
 * Ce qui a changé entre deux états d'un ticket, en libellés lisibles.
 *
 * Les champs personnalisés font exception : seul le NOM des champs touchés est
 * journalisé, pas leur contenu. Un champ libre peut porter un numéro de dossier,
 * un téléphone, l'adresse d'un mandant — le journal n'a pas à en garder une
 * copie qui survivrait à la suppression du ticket.
 */
export function diffTicketSnapshots(
  before: AuditTicketSnapshot,
  after: AuditTicketSnapshot,
): AuditChange[] {
  const changes: AuditChange[] = [];

  const push = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };

  push("Statut", before.status.name, after.status.name);
  push("Priorité", before.priority.name, after.priority.name);
  push("Produit concerné", before.category?.name ?? NONE, after.category?.name ?? NONE);
  push("Assigné à", agentLabel(before.assignee), agentLabel(after.assignee));

  const metadataKeys = changedMetadataKeys(before.metadata, after.metadata);
  if (metadataKeys.length > 0) {
    // Sans `from`/`to` : le nom des champs touchés, pas leur contenu.
    changes.push({ label: `Champs personnalisés : ${metadataKeys.join(", ")}` });
  }

  return changes;
}
