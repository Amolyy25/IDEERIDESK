import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { ALLOWED_ATTACHMENT_TYPES } from "@/lib/attachment-rules";

/**
 * Sert une pièce jointe de ticket.
 *
 * Périmètre volontairement aligné sur celui des tickets : dans ce produit, tout
 * agent approuvé peut consulter n'importe quel ticket (les groupes ne font que
 * pré-filtrer la liste par défaut, et `/tickets?scope=all` lève ce filtre
 * explicitement). Restreindre les pièces jointes par groupe créerait une
 * incohérence — fiche lisible mais fichier en 404. Le cloisonnement réel, s'il
 * est voulu, est une décision produit à appliquer d'abord à `getTickets` et
 * `getTicketById`, puis ici.
 *
 * Ce qui est corrigé en revanche : un compte non encore approuvé n'obtient plus
 * rien (`session.user.id` n'est posé qu'après décision d'un admin), et le type
 * servi est contraint — une pièce jointe entrante par email peut porter
 * n'importe quel type MIME, et un `text/html` servi `inline` depuis notre
 * domaine s'exécuterait en même origine avec la session de l'agent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  // `id` n'est posé que pour un agent actif ET approuvé (voir `@/auth`) : un
  // compte encore en attente de validation n'obtient rien ici.
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  // Fichier rattrapé par un rescan : ses octets ont déjà été purgés, mais on
  // répond explicitement plutôt que de servir un fichier vide — l'agent doit
  // comprendre pourquoi la pièce jointe ne s'ouvre pas.
  if (attachment.scanStatus === "INFECTED") {
    return NextResponse.json(
      { error: "Ce fichier a été mis en quarantaine par l'analyse antivirus." },
      { status: 403 },
    );
  }

  // Seules les images de la liste blanche s'affichent dans l'onglet ; tout le
  // reste est téléchargé, jamais interprété par le navigateur.
  const isSafeInline = ALLOWED_ATTACHMENT_TYPES.includes(attachment.mimeType);
  const disposition = isSafeInline ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": isSafeInline ? attachment.mimeType : "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
