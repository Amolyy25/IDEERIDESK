import type { TicketWithMessages } from "@/lib/actions/tickets";

/**
 * Lecture « dossier » d'un ticket : l'ensemble formé par le ticket d'accueil et
 * les doublons qui y ont été fusionnés.
 *
 * Une fusion ne juxtapose pas deux tickets, elle n'en fait plus qu'un seul
 * dossier à traiter — avec plusieurs personnes à qui répondre. Tout ce qui
 * s'affiche autour du fil (le panneau de droite, la zone de réponse) doit donc
 * raisonner sur cet ensemble, sinon l'écran continue de montrer un seul client
 * là où l'envoi en sert plusieurs.
 *
 * Module purement calculatoire : il ne lit rien en base, il dérive du ticket
 * déjà chargé par `getTicketById`.
 */

export type DossierClient = {
  /** Ticket par lequel cette personne est arrivée. */
  ticketId: string;
  ticketNumber: number;
  name: string;
  email: string;
  /** Client du ticket qui porte le dossier, par opposition à ceux des doublons. */
  isPrimary: boolean;
};

/**
 * Toutes les personnes qui recevront les réponses écrites sur ce dossier.
 *
 * Dédoublonnage par adresse, dans le même ordre et selon la même règle que
 * `getMergedRecipients` à l'envoi : quand la même personne a déposé deux fois la
 * même demande — le doublon accidentel — elle ne compte qu'une fois, et le
 * panneau doit annoncer le nombre d'emails qui partiront réellement, pas le
 * nombre de tickets rattachés.
 */
export function listDossierClients(dossier: TicketWithMessages): DossierClient[] {
  const seen = new Set<string>();
  const clients: DossierClient[] = [];

  if (dossier.client) {
    seen.add(dossier.client.email.toLowerCase());
    clients.push({
      ticketId: dossier.id,
      ticketNumber: dossier.number,
      name: dossier.client.name,
      email: dossier.client.email,
      isPrimary: true,
    });
  }

  for (const duplicate of dossier.mergedTickets) {
    const client = duplicate.client;
    if (!client) continue;

    const key = client.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    clients.push({
      ticketId: duplicate.id,
      ticketNumber: duplicate.number,
      name: client.name,
      email: client.email,
      isPrimary: false,
    });
  }

  return clients;
}

/** Destinataires supplémentaires apportés par les doublons, hors client d'origine. */
export function countMergedRecipients(clients: DossierClient[]) {
  return clients.filter((client) => !client.isPrimary).length;
}
