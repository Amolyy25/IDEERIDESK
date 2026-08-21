"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { notifyMentionedAgents } from "@/lib/mention-notifications";
import { auditRefSelect, recordAudit } from "@/lib/audit";
import { replySummary, resolveReplyBody, sendApprovedTicketReply } from "@/lib/ticket-reply";
import { inspectReplyAttachments } from "@/lib/reply-attachments";

const addMessageSchema = z.object({
  content: z.string().trim().min(1, "Message vide"),
  // Facultative : une note s'écrit en texte, et l'appelant peut être un onglet
  // périmé. Assainie avant enregistrement — une action exportée est un endpoint.
  contentHtml: z.string().optional(),
  isPrivate: z.boolean().default(false),
  /** Note citée. Vérifiée contre le ticket : un identifiant client ne suffit pas. */
  replyToId: z.string().optional(),
});

// Sans ce contrôle, l'identifiant transmis accrocherait une réponse à la note
// d'un autre dossier, dont l'extrait s'afficherait alors dans ce fil-ci.
async function resolveQuotedNote(ticketId: string, replyToId: string | undefined) {
  if (!replyToId) return null;

  const quoted = await prisma.message.findFirst({
    where: { id: replyToId, ticketId, isPrivate: true },
    select: { id: true },
  });
  if (!quoted) {
    throw new Error("La note à laquelle vous répondez n'existe plus.");
  }
  return quoted.id;
}

// `updateMany` et non `update` : la condition « personne n'est assigné » vit DANS
// l'UPDATE, donc de deux agents simultanés un seul trouve `assigneeId` à NULL. Un
// `findUnique` puis `update` donnerait le ticket au dernier des deux.
async function claimOnFirstReply(ticketId: string, agentId: string): Promise<boolean> {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, assigneeId: null },
    data: { assigneeId: agentId },
  });
  return count > 0;
}

/**
 * `files` voyage hors du schéma : un `File` traverse bien une Server Action mais
 * ne se valide pas en zod. Son contrôle est celui d'`inspectReplyAttachments`.
 */
export async function addTicketMessage(
  ticketId: string,
  input: z.infer<typeof addMessageSchema>,
  files: File[] = []
) {
  const data = addMessageSchema.parse(input);

  // L'auteur vient toujours de la session, jamais d'une valeur transmise par le
  // client : sinon un agent pourrait faire répondre un collègue à sa place.
  const session = await requirePermission("tickets.respond");
  const agentId = session.user.id;

  const isPublicAgentReply = !data.isPrivate;
  const needsApproval = isPublicAgentReply && session.user.requiresApproval;

  // Une note interne reste du texte : ses mentions sont repérées sur la chaîne
  // brute, et elle ne part dans aucun email.
  const body = isPublicAgentReply ? resolveReplyBody(data) : { content: data.content, html: null };

  // Une réponse publique ne cite aucune note interne, même si un onglet périmé
  // transmet l'identifiant de celle qui l'a préparée.
  const replyToId = isPublicAgentReply ? null : await resolveQuotedNote(ticketId, data.replyToId);

  // Avant la création du message : un fichier refusé (type, signature, antivirus)
  // ne doit pas laisser une réponse enregistrée sans sa pièce jointe.
  const attachments = await inspectReplyAttachments(files);

  const message = await prisma.message.create({
    data: {
      ticketId,
      content: body.content,
      contentHtml: body.html,
      authorType: "AGENT",
      agentId,
      isPrivate: data.isPrivate,
      approvalStatus: needsApproval ? "PENDING" : null,
      replyToId,
      attachments: { create: attachments.map((file) => ({ ...file, ticketId })) },
    },
  });

  // Seules les réponses publiques prennent le dossier : une note sert souvent à
  // faire l'inverse (« @Camille c'est pour toi »). Une réponse retenue en
  // validation le prend aussi — son auteur travaille bien ce dossier.
  const selfAssigned =
    isPublicAgentReply && agentId ? await claimOnFirstReply(ticketId, agentId) : false;

  const auditTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { updatedAt: new Date() },
    select: auditRefSelect,
  });
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  // Avant la trace de la réponse : le journal se lit dans l'ordre des gestes —
  // on prend le dossier, puis on répond.
  if (selfAssigned) {
    await recordAudit({
      session,
      action: "TICKET_CLAIMED",
      ticket: auditTicket,
      summary: "Prise en charge automatique : premier agent à répondre à ce ticket non assigné.",
    });
  }

  if (!isPublicAgentReply) {
    const { mentionedNames } = await notifyMentionedAgents({
      ticketId,
      messageId: message.id,
      actorId: agentId,
      content: data.content,
    });

    // Le corps de la note n'est PAS journalisé : le journal dit qu'une note a
    // été ajoutée, le fil dit laquelle. Les agents mentionnés font partie du
    // « qui » — c'est ce qui explique qu'un collègue reprenne le dossier.
    await recordAudit({
      session,
      action: "TICKET_NOTE_ADDED",
      ticket: auditTicket,
      summary:
        mentionedNames.length > 0
          ? `Note interne, avec mention de ${mentionedNames.join(", ")}.`
          : "Note interne, non visible du client.",
    });

    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: false,
      mentionedNames,
      // Toujours faux ici : une note interne ne prend pas le dossier.
      selfAssigned: false,
    };
  }

  if (needsApproval) {
    await recordAudit({
      session,
      action: "TICKET_REPLIED",
      ticket: auditTicket,
      summary: "Réponse rédigée, retenue en attente de validation — rien n'est parti au client.",
    });
    return {
      emailSent: false as const,
      emailSkippedReason: null,
      alsoSentTo: 0,
      pendingApproval: true,
      mentionedNames: [] as string[],
      selfAssigned,
    };
  }

  const sendResult = await sendApprovedTicketReply(
    ticketId,
    message.id,
    { content: message.content, html: message.contentHtml },
    agentId
  );

  await recordAudit({
    session,
    action: "TICKET_REPLIED",
    ticket: auditTicket,
    summary: replySummary(sendResult, attachments.length),
  });

  return { ...sendResult, pendingApproval: false, mentionedNames: [] as string[], selfAssigned };
}
