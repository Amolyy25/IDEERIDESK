"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requirePermission } from "@/lib/require-permission";
import { recordAudit } from "@/lib/audit";
import {
  readSubjectRecord,
  searchSubjectSummaries,
  subjectIdentity,
  type SubjectRecord,
} from "@/lib/privacy-dossier";
import { pseudonymizeSubjectInJournal } from "@/lib/privacy-journal";
import {
  SUBJECT_KIND_LABELS,
  isPseudonymEmail,
  subjectPseudonym,
} from "@/lib/privacy-subject";

/**
 * Réponses aux droits d'une personne concernée : anonymisation et suppression.
 *
 * L'export, lui, est une route (`/api/privacy/export`) et non une action : une
 * Server Action renvoie une valeur à un composant, pas un fichier à télécharger.
 *
 * Les deux gestes d'ici sont IRRÉVERSIBLES et portent sur une personne, pas sur
 * une donnée métier. Trois principes en découlent, et se retrouvent dans chaque
 * fonction :
 *
 * 1. **Le journal d'audit est réécrit AVANT que la fiche disparaisse.** Il faut le
 *    nom et l'email de la personne pour les retirer du journal ; une fois la
 *    fiche supprimée, ils ne sont plus lisibles nulle part et l'identité y
 *    resterait pour toujours.
 *
 * 2. **La trace du geste ne nomme personne.** Journaliser « Anonymisation de Jean
 *    Dupont » réintroduirait dans le journal l'identité qu'on vient d'en retirer.
 *    La trace ne porte donc que le pseudonyme — qui suffit à relier les entrées
 *    entre elles, y compris l'export remis à la personne quelques jours plus tôt.
 *
 * 3. **Aucun compte ne s'efface tout seul, ni n'efface celui dont il dépend.** Les
 *    mêmes garde-fous que les gestes de la page Équipe, pour la même raison :
 *    sans eux, un effacement laisse l'installation sans administrateur.
 */

const subjectSchema = z.object({
  kind: z.enum(["CLIENT", "AGENT"]),
  id: z.string().min(1),
});

type SubjectInput = z.infer<typeof subjectSchema>;

export async function searchDataSubjects(term: string) {
  await requirePermission("privacy.manage");
  return searchSubjectSummaries(z.string().max(200).parse(term));
}

// ---------------------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------------------

/**
 * Refuse d'effacer un compte de l'équipe quand ça casserait l'installation ou
 * quand l'appelant n'est pas en position de le faire.
 *
 * Décalque des règles de `updateAgentPermissions` (src/lib/actions/agents.ts) :
 * on ne s'efface pas soi-même, on ne touche pas au compte d'un administrateur
 * sans l'être, et on ne retire pas le dernier administrateur actif. Un
 * effacement est plus définitif qu'une désactivation — il serait absurde qu'il
 * soit moins protégé.
 *
 * Aucun garde-fou en face pour un client : sa fiche ne donne aucun accès, et
 * refuser d'effacer un client à qui il reste des tickets reviendrait à refuser
 * d'honorer un droit à l'effacement.
 */
async function refuseUnsafeAgentErasure(session: Session, record: SubjectRecord) {
  if (record.kind !== "AGENT") return;
  const agent = record.agent;

  if (agent.id === session.user.id) {
    throw new Error(
      "Vous ne pouvez pas effacer votre propre compte. Demandez-le à un autre administrateur.",
    );
  }

  if (agent.role === "ADMIN") {
    // Le rôle et pas seulement « team.manage » : sans cette règle, le porteur de
    // « privacy.manage » effacerait l'administrateur dont il dépend.
    await requireAdmin();

    if (agent.isActive) {
      const otherAdmins = await prisma.agent.count({
        where: {
          id: { not: agent.id },
          role: "ADMIN",
          isActive: true,
          approvalStatus: "APPROVED",
        },
      });
      if (otherAdmins === 0) {
        throw new Error(
          "C'est le dernier administrateur actif : nommez-en un autre avant d'effacer celui-ci.",
        );
      }
    }
  }
}

/** La personne visée, ou une erreur lisible si l'identifiant ne désigne plus rien. */
async function loadSubject(input: SubjectInput): Promise<SubjectRecord> {
  const record = await readSubjectRecord(input.kind, input.id);
  if (!record) {
    throw new Error("Cette personne n'existe plus dans l'application.");
  }
  return record;
}

/** Tickets qui survivront au geste — l'écran comme la trace l'annoncent. */
function countRemainingTickets(record: SubjectRecord) {
  return record.kind === "CLIENT"
    ? prisma.ticket.count({ where: { clientId: record.client.id } })
    : prisma.ticket.count({ where: { assigneeId: record.agent.id } });
}

// ---------------------------------------------------------------------------
// Anonymisation
// ---------------------------------------------------------------------------

/**
 * Remplace l'identité d'une personne par un pseudonyme, partout où elle est
 * stockée comme identité : sa fiche, et le journal d'audit.
 *
 * Ce qui subsiste, et qu'il faut savoir avant de cliquer : le SUJET, la
 * DESCRIPTION et les MESSAGES de ses tickets ne sont pas réécrits. Ce sont des
 * textes rédigés par des humains, où l'identité apparaît sous des formes qu'aucune
 * règle ne rattrape (« bonjour, c'est Jean du cabinet Dupont, mon numéro est
 * le… »). Y toucher automatiquement abîmerait le dossier support sans garantir
 * l'effacement. L'écran le dit, et l'export permet de vérifier ce qui reste.
 */
export async function anonymizeDataSubject(input: SubjectInput) {
  const session = await requirePermission("privacy.manage");
  const { kind, id } = subjectSchema.parse(input);

  const record = await loadSubject({ kind, id });
  const identity = subjectIdentity(record);

  if (isPseudonymEmail(identity.email)) {
    throw new Error("L'identité de cette personne a déjà été effacée.");
  }

  await refuseUnsafeAgentErasure(session, record);

  const ticketCount = await countRemainingTickets(record);
  const pseudonym = subjectPseudonym(id);

  // Le journal d'abord : il a besoin du nom et de l'email, que l'écriture
  // ci-dessous va justement faire disparaître.
  const journal = await pseudonymizeSubjectInJournal({
    kind,
    subjectId: id,
    name: identity.name,
    email: identity.email,
  });

  if (kind === "CLIENT") {
    await prisma.client.update({
      where: { id },
      data: {
        name: pseudonym.name,
        email: pseudonym.email,
        phone: null,
        company: null,
        anonymizedAt: new Date(),
      },
    });
  } else {
    await prisma.agent.update({
      where: { id },
      data: {
        name: pseudonym.name,
        email: pseudonym.email,
        // Une photo de profil Google est une donnée personnelle à part entière,
        // et l'URL reste publiquement atteignable tant qu'elle est stockée.
        avatarUrl: null,
        // Un compte sans identité ne doit plus servir à rien. Le changement
        // d'email suffit d'ailleurs à couper l'accès immédiatement, sans attendre
        // l'expiration du jeton de session : le callback `session` retrouve
        // l'agent PAR SON EMAIL, et ne trouve donc plus personne.
        isActive: false,
        approvalStatus: "REJECTED",
        approvalDecidedAt: new Date(),
        permissions: [],
        // Les rattachements sont dénoués aussi : un pseudonyme qui reste inscrit
        // au groupe « Support Papairis » ou visé par une signature nominative
        // continue de désigner quelqu'un par sa place dans l'organisation, et
        // encombre deux écrans de réglages d'un compte qui n'existe plus.
        groups: { set: [] },
        signatures: { set: [] },
        anonymizedAt: new Date(),
      },
    });
  }

  await recordAudit({
    session,
    action: "SUBJECT_ANONYMIZED",
    summary: [
      `${SUBJECT_KIND_LABELS[kind]} anonymisé : « ${pseudonym.name} ».`,
      `${ticketCount} ticket(s) conservé(s).`,
      `Journal : ${journal.authoredEntries} trace(s) d'auteur et ${journal.mentionEntries} mention(s) pseudonymisées.`,
      journal.nameLeftInPlace
        ? "Nom trop court pour être cherché dans le texte des résumés : seul l'email y a été remplacé."
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  });

  revalidatePath("/privacy");
  revalidatePath(kind === "CLIENT" ? "/clients" : "/agents");
  revalidatePath("/audit");

  return { pseudonym: pseudonym.name, ticketCount, journal };
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

/**
 * Supprime la fiche d'une personne. Ses tickets restent, sans demandeur.
 *
 * Le journal est pseudonymisé avant la suppression, sinon le nom et l'email
 * resteraient en clair dans des traces qu'on ne pourrait plus rattacher à
 * personne pour les nettoyer — le pire des deux mondes.
 *
 * À savoir, et l'écran le dit avant de laisser cliquer : les tickets survivent
 * avec leur sujet, leur description et leur fil, où l'identité de la personne
 * figure souvent en toutes lettres. La suppression de la fiche est donc un
 * effacement PARTIEL. L'anonymisation, elle, est le geste réversiblement
 * cohérent : elle laisse une fiche pseudonyme qui continue de porter le dossier.
 */
export async function deleteDataSubject(input: SubjectInput) {
  const session = await requirePermission("privacy.manage");
  const { kind, id } = subjectSchema.parse(input);

  const record = await loadSubject({ kind, id });
  const identity = subjectIdentity(record);

  await refuseUnsafeAgentErasure(session, record);

  const ticketCount = await countRemainingTickets(record);
  const pseudonym = subjectPseudonym(id);

  const journal = await pseudonymizeSubjectInJournal({
    kind,
    subjectId: id,
    name: identity.name,
    email: identity.email,
  });

  // Les liens se dénouent d'eux-mêmes : `Ticket.clientId`, `Ticket.assigneeId`,
  // `Message.agentId` et `AuditLog.actorId` sont tous facultatifs et passent à
  // NULL. C'est ce qui permet à un ticket de survivre à la disparition de son
  // demandeur, et au journal de survivre à celle de son auteur.
  if (kind === "CLIENT") {
    await prisma.client.delete({ where: { id } });
  } else {
    await prisma.agent.delete({ where: { id } });
  }

  await recordAudit({
    session,
    action: "SUBJECT_DELETED",
    summary: [
      `Fiche supprimée (${SUBJECT_KIND_LABELS[kind].toLowerCase()}) : « ${pseudonym.name} ».`,
      ticketCount > 0
        ? `${ticketCount} ticket(s) conservé(s), désormais sans ${kind === "CLIENT" ? "demandeur" : "assigné"}.`
        : "Aucun ticket rattaché.",
      `Journal : ${journal.authoredEntries} trace(s) d'auteur et ${journal.mentionEntries} mention(s) pseudonymisées.`,
    ].join(" "),
  });

  revalidatePath("/privacy");
  revalidatePath(kind === "CLIENT" ? "/clients" : "/agents");
  revalidatePath("/audit");

  return { pseudonym: pseudonym.name, ticketCount, journal };
}
