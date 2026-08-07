import { prisma } from "@/lib/prisma";
import { scanBuffer } from "@/lib/antivirus";

/**
 * Reprise des fichiers restés en PENDING.
 *
 * Deux populations à rattraper :
 *
 * 1. Les fichiers entrés pendant une indisponibilité du scanner. Les routes de
 *    téléversement ne bloquent pas dans ce cas (voir `upload-inspection.ts`) —
 *    la contrepartie de ce choix est qu'il faut repasser derrière.
 * 2. Tout le stock antérieur à la mise en place de l'analyse : la migration
 *    marque l'existant PENDING justement pour qu'il passe ici.
 *
 * Une signature publiée après coup peut donc rattraper un fichier déjà stocké.
 * Dans ce cas les octets sont **purgés** : la ligne reste comme trace (nom,
 * taille reçue, signature détectée, date) mais ne porte plus la charge. Garder
 * un binaire malveillant en base pour « pouvoir l'analyser plus tard » est un
 * risque net, et la trace suffit à comprendre ce qui s'est passé.
 */

/**
 * Plafond par passage. Chaque fichier fait jusqu'à 5 Mo et transite par le
 * réseau vers clamd : un passage non borné sur un gros arriéré tiendrait la
 * connexion et la mémoire du process pendant très longtemps. Le reste sera pris
 * au passage suivant.
 */
const MAX_FILES_PER_RUN = 200;

/** Nombre d'identifiants récupérés par requête de listage. */
const PAGE_SIZE = 25;

type ScanTarget = {
  label: string;
  listPending: (take: number) => Promise<{ id: string }[]>;
  load: (id: string) => Promise<{ data: Uint8Array } | null>;
  markClean: (id: string) => Promise<unknown>;
  quarantine: (id: string, signature: string) => Promise<unknown>;
};

/** Critère de listage, identique pour les trois tables. */
const PENDING = { scanStatus: "PENDING" } as const;

/** Champs posés sur un fichier déclaré sain. */
const CLEAN_PATCH = () => ({
  scanStatus: "CLEAN" as const,
  scanSignature: null,
  scannedAt: new Date(),
});

/**
 * Champs posés sur un fichier mis en quarantaine. Les octets partent ; `size`
 * garde la taille reçue, parce que la ligne doit continuer à dire ce qui est
 * entré même une fois la charge retirée.
 */
const QUARANTINE_PATCH = (signature: string) => ({
  scanStatus: "INFECTED" as const,
  scanSignature: signature,
  scannedAt: new Date(),
  data: new Uint8Array(),
});

const ORDER = { createdAt: "asc" } as const;

/**
 * Les trois tables qui stockent des octets exposent les mêmes colonnes
 * d'analyse, mais leurs délégués Prisma sont des types distincts : on les
 * adapte explicitement plutôt que de les forcer dans une signature commune.
 *
 * Les octets sont chargés fichier par fichier, jamais par lot : un lot de 25
 * pièces jointes de 5 Mo, ce serait 125 Mo tenus en mémoire d'un coup.
 */
const TARGETS: ScanTarget[] = [
  {
    label: "attachment",
    listPending: (take) =>
      prisma.attachment.findMany({ where: PENDING, select: { id: true }, orderBy: ORDER, take }),
    load: (id) => prisma.attachment.findUnique({ where: { id }, select: { data: true } }),
    markClean: (id) => prisma.attachment.update({ where: { id }, data: CLEAN_PATCH() }),
    quarantine: (id, signature) =>
      prisma.attachment.update({ where: { id }, data: QUARANTINE_PATCH(signature) }),
  },
  {
    label: "portalAsset",
    listPending: (take) =>
      prisma.portalAsset.findMany({ where: PENDING, select: { id: true }, orderBy: ORDER, take }),
    load: (id) => prisma.portalAsset.findUnique({ where: { id }, select: { data: true } }),
    markClean: (id) => prisma.portalAsset.update({ where: { id }, data: CLEAN_PATCH() }),
    quarantine: (id, signature) =>
      prisma.portalAsset.update({ where: { id }, data: QUARANTINE_PATCH(signature) }),
  },
  {
    label: "knowledgeArticleImage",
    listPending: (take) =>
      prisma.knowledgeArticleImage.findMany({
        where: PENDING,
        select: { id: true },
        orderBy: ORDER,
        take,
      }),
    load: (id) => prisma.knowledgeArticleImage.findUnique({ where: { id }, select: { data: true } }),
    markClean: (id) => prisma.knowledgeArticleImage.update({ where: { id }, data: CLEAN_PATCH() }),
    quarantine: (id, signature) =>
      prisma.knowledgeArticleImage.update({ where: { id }, data: QUARANTINE_PATCH(signature) }),
  },
];

export type RescanReport = {
  scanned: number;
  clean: number;
  quarantined: number;
  /** Renseigné si le passage s'est arrêté avant d'avoir vidé la file. */
  stoppedBecause: "budget" | "scanner-indisponible" | null;
  detail: string | null;
};

export async function rescanPendingFiles(): Promise<RescanReport> {
  const report: RescanReport = {
    scanned: 0,
    clean: 0,
    quarantined: 0,
    stoppedBecause: null,
    detail: null,
  };

  for (const target of TARGETS) {
    while (report.scanned < MAX_FILES_PER_RUN) {
      const remaining = MAX_FILES_PER_RUN - report.scanned;
      const batch = await target.listPending(Math.min(PAGE_SIZE, remaining));
      if (batch.length === 0) break;

      for (const { id } of batch) {
        const row = await target.load(id);
        // Supprimé entre le listage et le chargement : rien à faire.
        if (!row) continue;

        const verdict = await scanBuffer(row.data);

        if (verdict.status === "UNAVAILABLE") {
          // Le scanner est tombé : les fichiers suivants échoueraient de la même
          // façon. On s'arrête, ils restent PENDING pour le passage suivant.
          report.stoppedBecause = "scanner-indisponible";
          report.detail = verdict.reason;
          return report;
        }

        report.scanned += 1;

        if (verdict.status === "INFECTED") {
          await target.quarantine(id, verdict.signature);
          report.quarantined += 1;
          console.warn(
            `[antivirus] mise en quarantaine ${target.label}#${id} — signature ${verdict.signature}`,
          );
        } else {
          await target.markClean(id);
          report.clean += 1;
        }
      }
    }
  }

  if (report.scanned >= MAX_FILES_PER_RUN) report.stoppedBecause = "budget";
  return report;
}
