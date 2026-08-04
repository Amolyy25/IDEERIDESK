/**
 * Ramène les images des contenus d'email à un chemin relatif.
 *
 * À passer une fois, après le correctif qui cesse d'enregistrer l'origine
 * publique en base (voir src/lib/email-asset-urls.ts). Les contenus enregistrés
 * avant portent une adresse absolue figée — `http://localhost:3002/…` pour tout
 * ce qui a été enregistré en développement — que le client mail du destinataire
 * ne peut pas atteindre, et qu'une `APP_URL` corrigée ne répare pas : l'adresse
 * est déjà écrite dans la ligne.
 *
 *   npx tsx --env-file=.env scripts/repair-email-image-urls.ts           # aperçu
 *   npx tsx --env-file=.env scripts/repair-email-image-urls.ts --write   # applique
 *
 * Ne touche qu'aux `src` désignant nos propres visuels (/api/portal/assets/… et
 * le logo livré avec l'application) : une image hébergée ailleurs, légitimement
 * absolue, est laissée telle quelle.
 */

import { prisma } from "../src/lib/prisma";

const WRITE = process.argv.includes("--write");

// `src="https://n'importe-quel-hôte/api/portal/assets/…"` → `src="/api/portal/assets/…"`.
// L'hôte n'est pas contraint : le but est justement de retirer celui qui a été
// figé, quel qu'il soit (localhost en développement, domaine de staging…).
const OWN_ASSET = /(\ssrc\s*=\s*["'])https?:\/\/[^/"']+(\/(?:api\/portal\/assets\/|logoIdeeri\.))/gi;

function toRelative(html: string) {
  return html.replace(OWN_ASSET, "$1$2");
}

/** Chaque contenu d'email enregistré, avec de quoi le relire et le réécrire. */
const TARGETS = [
  {
    label: "gabarit commun",
    rows: () => prisma.emailLayoutTemplate.findMany({ select: { id: true, html: true } }),
    field: "html",
    update: (id: string, html: string) =>
      prisma.emailLayoutTemplate.update({ where: { id }, data: { html } }),
  },
  {
    label: "signature",
    rows: () => prisma.emailSignature.findMany({ select: { id: true, bodyHtml: true } }),
    field: "bodyHtml",
    update: (id: string, bodyHtml: string) =>
      prisma.emailSignature.update({ where: { id }, data: { bodyHtml } }),
  },
  {
    label: "message de clôture",
    rows: () => prisma.ticketClosureTemplate.findMany({ select: { id: true, bodyHtml: true } }),
    field: "bodyHtml",
    update: (id: string, bodyHtml: string) =>
      prisma.ticketClosureTemplate.update({ where: { id }, data: { bodyHtml } }),
  },
  {
    label: "accusé de réception",
    rows: () =>
      prisma.ticketAcknowledgementTemplate.findMany({ select: { id: true, bodyHtml: true } }),
    field: "bodyHtml",
    update: (id: string, bodyHtml: string) =>
      prisma.ticketAcknowledgementTemplate.update({ where: { id }, data: { bodyHtml } }),
  },
];

async function main() {
  let touched = 0;

  for (const target of TARGETS) {
    for (const row of await target.rows()) {
      const before = (row as Record<string, string>)[target.field];
      const after = toRelative(before);
      if (before === after) continue;

      touched += 1;
      // On n'affiche jamais le contenu : signatures et modèles portent des noms
      // et des adresses email. Seul le nombre d'images corrigées est utile ici.
      const count = before.match(OWN_ASSET)?.length ?? 0;
      console.log(
        `${WRITE ? "corrigé" : "à corriger"} — ${target.label} ${row.id} (${count} image(s))`
      );

      if (WRITE) await target.update(row.id, after);
    }
  }

  if (touched === 0) {
    console.log("Rien à corriger : aucune adresse absolue vers nos visuels en base.");
  } else if (!WRITE) {
    console.log(`\n${touched} enregistrement(s) à corriger. Relancez avec --write pour appliquer.`);
  } else {
    console.log(`\n${touched} enregistrement(s) corrigé(s).`);
  }

  await prisma.$disconnect();
}

main();
