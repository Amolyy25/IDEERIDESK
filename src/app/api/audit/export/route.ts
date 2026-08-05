import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { auditSelect, buildAuditWhere, auditFiltersFromParams } from "@/lib/audit-query";
import { auditCsvFilename, auditCsvHeader, auditCsvLine } from "@/lib/audit-csv";

/**
 * Export CSV du journal d'audit, sur le périmètre exactement filtré à l'écran.
 *
 * Route plutôt que Server Action : une action renvoie une valeur au composant,
 * pas un fichier à télécharger. Ici le navigateur reçoit un `Content-Disposition:
 * attachment` et fait le travail lui-même, sans qu'on ait à construire un
 * `Blob` côté client — ce qui aurait supposé de charger tout le journal en
 * mémoire dans l'onglet.
 *
 * Réservé aux administrateurs, comme la page : un export contourne l'écran mais
 * pas le contrôle d'accès.
 */

/**
 * Taille des lots lus en base pendant que le fichier se construit.
 *
 * Le journal est la table qui grossit le plus vite de ce schéma (une ligne par
 * consultation) : un `findMany` sans borne finirait par charger des centaines de
 * milliers de lignes en mémoire pour les concaténer. Ici la réponse est un flux —
 * chaque lot est écrit puis oublié, la consommation mémoire reste celle d'un lot
 * quelle que soit la taille de l'export.
 */
const BATCH_SIZE = 1_000;

export async function GET(request: NextRequest) {
  const session = await auth();

  // `id` n'est posé que pour un agent actif ET approuvé (voir `@/auth`).
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Action réservée aux administrateurs." }, { status: 403 });
  }

  const filters = auditFiltersFromParams(request.nextUrl.searchParams);
  const where = buildAuditWhere(filters);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(auditCsvHeader()));

      // Pagination par curseur et non par `skip` : sur une table qui reçoit des
      // écritures pendant l'export, `skip` fait sauter ou répéter des lignes à
      // mesure que de nouvelles s'insèrent. Le curseur sur un identifiant stable
      // ne peut pas dériver.
      let cursor: string | undefined;

      try {
        for (;;) {
          const batch = await prisma.auditLog.findMany({
            where,
            select: auditSelect,
            // Du plus ancien au plus récent — l'inverse de l'écran, et c'est
            // voulu : un relevé se lit du début à la fin, et une ligne ajoutée
            // pendant l'export vient alors s'ajouter à la suite au lieu de
            // décaler tout ce qui a déjà été écrit. `id` départage les
            // horodatages identiques, sans quoi l'ordre ne serait pas total et la
            // pagination pourrait boucler.
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

        controller.close();
      } catch (error) {
        // Le fichier est déjà partiellement transmis : impossible de le remplacer
        // par une réponse d'erreur propre. On coupe le flux, ce que le navigateur
        // signale comme un téléchargement interrompu — mieux qu'un CSV
        // silencieusement tronqué qu'on croirait complet.
        console.error("[audit] export CSV interrompu", error);
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${auditCsvFilename(new Date())}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
