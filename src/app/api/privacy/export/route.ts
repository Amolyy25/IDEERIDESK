import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { auditSelect } from "@/lib/audit-query";
import { auditCsvLine } from "@/lib/audit-csv";
import { PERMISSIONS, can } from "@/lib/permissions";
import { readSubjectDossier, readSubjectRecord, subjectIdentity, subjectJournalWhere } from "@/lib/privacy-dossier";
import { subjectCsvHead, subjectCsvTail } from "@/lib/privacy-csv";
import { isSubjectKind, subjectExportFilename, SUBJECT_KIND_LABELS } from "@/lib/privacy-subject";

/**
 * Dossier complet d'une personne concernée, en une action (art. 15 et 20).
 *
 * Route et non Server Action, pour la même raison que l'export du journal : une
 * action renvoie une valeur à un composant, pas un fichier. Le navigateur reçoit
 * ici un `Content-Disposition: attachment` et fait le téléchargement lui-même —
 * ce qui évite de charger tout le dossier dans l'onglet avant de l'écrire.
 *
 * Deux décisions propres à cet export :
 *
 * — **La trace d'audit est écrite AVANT que le fichier soit transmis.** Un flux
 *   interrompu à mi-chemin a quand même sorti des données de l'application ; ne
 *   journaliser qu'en cas de succès laisserait sans trace précisément les cas
 *   qu'un contrôle voudrait examiner.
 *
 * — **Le journal d'audit de la personne est parcouru en lots**, comme dans
 *   `/api/audit/export`. Une seule consultation de fiche y laisse une ligne : pour
 *   un agent en poste depuis un an, c'est la partie la plus volumineuse du
 *   dossier, et de loin.
 */

const BATCH_SIZE = 1_000;

export async function GET(request: NextRequest) {
  const session = await auth();

  // `id` n'est posé que pour un agent actif ET approuvé (voir `@/auth`).
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!can(session.user.permissions, "privacy.manage")) {
    return NextResponse.json({ error: PERMISSIONS["privacy.manage"].denial }, { status: 403 });
  }

  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  const id = request.nextUrl.searchParams.get("id") ?? "";

  if (!isSubjectKind(kind) || !id) {
    return NextResponse.json({ error: "Personne concernée non précisée." }, { status: 400 });
  }

  const record = await readSubjectRecord(kind, id);
  if (!record) {
    return NextResponse.json(
      { error: "Cette personne n'existe plus dans l'application." },
      { status: 404 },
    );
  }

  const dossier = await readSubjectDossier(kind, id);
  if (!dossier) {
    return NextResponse.json(
      { error: "Cette personne n'existe plus dans l'application." },
      { status: 404 },
    );
  }

  const journalWhere = subjectJournalWhere(record);
  const journalEntryCount = await prisma.auditLog.count({ where: journalWhere });

  const identity = subjectIdentity(record);
  const generatedAt = new Date();

  // La trace nomme la personne, et c'est voulu : elle est la preuve de ce qui a
  // été remis, à quelle date et par qui. Si cette même personne demande ensuite
  // son effacement, la pseudonymisation du journal réécrit ce résumé comme les
  // autres (voir src/lib/privacy-journal.ts) — l'identité n'y survit donc pas à
  // l'effacement, mais la preuve du geste, elle, reste.
  await recordAudit({
    session,
    action: "SUBJECT_DATA_EXPORTED",
    summary: [
      `Dossier personnel extrait : ${identity.name} (${identity.email}),`,
      `${SUBJECT_KIND_LABELS[kind].toLowerCase()}.`,
      `${dossier.tickets.length} ticket(s), ${dossier.messages.length} message(s),`,
      `${journalEntryCount} entrée(s) de journal.`,
    ].join(" "),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          subjectCsvHead({
            dossier,
            generatedAt,
            requestedByName: session.user.name || (session.user.email ?? ""),
            requestedByEmail: session.user.email ?? "",
          }),
        ),
      );

      // Pagination par curseur et non par `skip` : le journal reçoit des
      // écritures pendant l'export (celle du geste ci-dessus, notamment), et
      // `skip` ferait alors sauter ou répéter des lignes.
      let cursor: string | undefined;

      try {
        for (;;) {
          const batch = await prisma.auditLog.findMany({
            where: journalWhere,
            select: auditSelect,
            // Du plus ancien au plus récent : un relevé se lit du début à la fin.
            // `id` départage les horodatages identiques, sans quoi l'ordre ne
            // serait pas total et la pagination pourrait boucler.
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });

          if (batch.length === 0) break;

          for (const entry of batch) {
            controller.enqueue(encoder.encode(auditCsvLine(entry)));
          }

          if (batch.length < BATCH_SIZE) break;
          cursor = batch[batch.length - 1].id;
        }

        controller.enqueue(encoder.encode(subjectCsvTail(dossier, journalEntryCount)));
        controller.close();
      } catch (error) {
        // Le fichier est déjà partiellement transmis : impossible de le remplacer
        // par une réponse d'erreur propre. On coupe le flux, ce que le navigateur
        // signale comme un téléchargement interrompu — mieux qu'un dossier
        // silencieusement tronqué qu'on croirait complet, et qu'on remettrait
        // comme tel à la personne concernée.
        console.error("[privacy] export du dossier interrompu", error);
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${subjectExportFilename(kind, id, generatedAt)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
