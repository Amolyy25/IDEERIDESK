import { prisma } from "@/lib/prisma";
import {
  fillCannedVariables,
  type CannedVariables,
} from "@/lib/canned-response-variables";
import type { CannedResponseDimension } from "@/generated/prisma/client";

/**
 * Réponses prédéfinies : dimensions de filtrage, mise en correspondance avec un
 * ticket, et remplissage des variables.
 *
 * Une réponse type n'a de sens que dans un contexte : « Votre licence a été
 * réactivée » ne concerne pas un ticket de bug. Plutôt que de coder en dur les
 * critères de tri, ce module tient un REGISTRE des dimensions filtrables
 * (`FILTER_DIMENSIONS`). Chaque entrée dit trois choses : comment l'appeler dans
 * l'interface, où lire ses valeurs possibles, et comment retrouver la valeur
 * portée par un ticket. Tout le reste — formulaire de réglages, colonne de la
 * liste, filtrage à l'ouverture d'un ticket — se déduit de ce registre.
 *
 * Ajouter une dimension (le groupe du ticket, son client…) tient donc en deux
 * gestes : une valeur dans l'enum `CannedResponseDimension` du schéma Prisma, et
 * une entrée ici. Aucun autre fichier à toucher.
 *
 * Module serveur (il interroge la base). Les composants clients reçoivent des
 * données déjà résolues, ils n'importent rien d'ici.
 */

/** Une valeur possible d'une dimension : ce qu'on coche dans le formulaire. */
export type FilterOption = {
  id: string;
  name: string;
};

/**
 * Ce qu'il faut savoir d'un ticket pour décider si une réponse le concerne.
 * Volontairement réduit aux identifiants : ce module n'a pas besoin du ticket
 * entier, et l'annoncer ainsi rend la fonction de correspondance testable avec
 * quatre chaînes de caractères.
 */
export type TicketScope = {
  categoryId: string | null;
  formSourceId: string | null;
  priorityId: string;
  statusId: string;
};

type DimensionDefinition = {
  key: CannedResponseDimension;
  /** Intitulé du groupe de cases à cocher, dans le formulaire. */
  label: string;
  /** Ce que veut dire « aucune case cochée », affiché sous le groupe. */
  everyValueLabel: string;
  /** Valeurs proposées, dans l'ordre d'affichage voulu. */
  loadOptions: () => Promise<FilterOption[]>;
  /** Valeur portée par un ticket, ou null quand il n'en a aucune. */
  ticketValueId: (ticket: TicketScope) => string | null;
};

/**
 * Le registre. L'ordre est celui d'affichage dans le formulaire : du critère le
 * plus parlant pour choisir une réponse type (le produit) au plus accessoire.
 */
const FILTER_DIMENSIONS: DimensionDefinition[] = [
  {
    key: "CATEGORY",
    label: "Produit concerné",
    everyValueLabel: "Tous les produits",
    loadOptions: () =>
      prisma.ticketCategory.findMany({
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
    ticketValueId: (ticket) => ticket.categoryId,
  },
  {
    key: "SOURCE",
    label: "Source",
    everyValueLabel: "Toutes les sources",
    loadOptions: () =>
      prisma.source.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ticketValueId: (ticket) => ticket.formSourceId,
  },
  {
    key: "PRIORITY",
    label: "Priorité",
    everyValueLabel: "Toutes les priorités",
    loadOptions: () =>
      prisma.ticketPriority.findMany({
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
    ticketValueId: (ticket) => ticket.priorityId,
  },
  {
    key: "STATUS",
    label: "Statut",
    everyValueLabel: "Tous les statuts",
    loadOptions: () =>
      prisma.ticketStatus.findMany({
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
    ticketValueId: (ticket) => ticket.statusId,
  },
];

/** Les clés du registre, pour valider une entrée venue du client. */
export const FILTER_DIMENSION_KEYS = FILTER_DIMENSIONS.map((dimension) => dimension.key);

/**
 * Intitulé d'une dimension, pour les messages d'erreur. Une clé hors registre
 * est renvoyée telle quelle plutôt que masquée : elle ne devrait pas exister, et
 * la voir dans le message met sur la piste.
 */
export function dimensionLabel(key: CannedResponseDimension): string {
  const dimension = FILTER_DIMENSIONS.find((candidate) => candidate.key === key);
  if (!dimension) return key;
  return dimension.label;
}

/** Une dimension avec ses valeurs, telle que le formulaire de réglages la reçoit. */
export type FilterDimensionWithOptions = {
  key: CannedResponseDimension;
  label: string;
  everyValueLabel: string;
  options: FilterOption[];
};

/**
 * Le registre résolu : chaque dimension accompagnée de ses valeurs actuelles.
 * Une dimension sans aucune valeur configurée (aucune source créée, par exemple)
 * est écartée — un groupe de cases vide n'apprend rien à personne.
 */
export async function loadFilterDimensions(): Promise<FilterDimensionWithOptions[]> {
  const loaded = await Promise.all(
    FILTER_DIMENSIONS.map(async (dimension) => ({
      key: dimension.key,
      label: dimension.label,
      everyValueLabel: dimension.everyValueLabel,
      options: await dimension.loadOptions(),
    })),
  );

  return loaded.filter((dimension) => dimension.options.length > 0);
}

/** Un filtre enregistré, réduit à ce dont la correspondance a besoin. */
export type StoredFilter = {
  dimension: CannedResponseDimension;
  valueId: string;
};

/**
 * Cette réponse concerne-t-elle ce ticket ?
 *
 * La règle, dimension par dimension :
 * - aucun filtre posé sur la dimension → elle ne restreint rien, on passe ;
 * - des filtres posés → le ticket doit porter l'une des valeurs listées.
 *
 * Autrement dit : un OU à l'intérieur d'une dimension, un ET entre les
 * dimensions. Une réponse limitée au produit « Papairis » et à la priorité
 * « Urgente » ne sort que sur les tickets urgents de Papairis.
 *
 * Un ticket sans valeur sur une dimension filtrée (pas de produit renseigné, par
 * exemple) ne correspond pas : la réponse a été écrite pour des produits
 * précis, la proposer sur un ticket qui n'en a aucun serait un contresens.
 */
export function matchesTicket(filters: StoredFilter[], ticket: TicketScope): boolean {
  for (const dimension of FILTER_DIMENSIONS) {
    const allowedValueIds = filters
      .filter((filter) => filter.dimension === dimension.key)
      .map((filter) => filter.valueId);

    if (allowedValueIds.length === 0) {
      continue;
    }

    const ticketValueId = dimension.ticketValueId(ticket);
    if (ticketValueId === null) {
      return false;
    }
    if (!allowedValueIds.includes(ticketValueId)) {
      return false;
    }
  }

  return true;
}

/**
 * Vérifie que les valeurs cochées existent encore, dimension par dimension.
 * Renvoie les dimensions fautives, vide si tout est bon.
 *
 * Sans ce contrôle, un produit supprimé dans un autre onglet pendant l'édition
 * s'enregistrerait comme filtre : la réponse ne ressortirait plus jamais, sans
 * que rien ne l'explique. `valueId` n'étant pas une clé étrangère (voir le
 * schéma), la base ne peut pas le refuser à notre place.
 */
export async function findUnknownFilterValues(
  filters: StoredFilter[],
): Promise<CannedResponseDimension[]> {
  const unknown: CannedResponseDimension[] = [];

  for (const dimension of FILTER_DIMENSIONS) {
    const valueIds = filters
      .filter((filter) => filter.dimension === dimension.key)
      .map((filter) => filter.valueId);

    if (valueIds.length === 0) {
      continue;
    }

    const options = await dimension.loadOptions();
    const knownIds = new Set(options.map((option) => option.id));
    if (valueIds.some((valueId) => !knownIds.has(valueId))) {
      unknown.push(dimension.key);
    }
  }

  return unknown;
}

// ---------------------------------------------------------------------------
// Réponses proposées sur un ticket
// ---------------------------------------------------------------------------

/** Une réponse prête à être insérée : variables déjà remplies. */
export type CannedResponseForTicket = {
  id: string;
  title: string;
  body: string;
};

/** Ce que la zone de rédaction reçoit pour un ticket donné. */
export type TicketCannedResponses = {
  /** Toutes celles qui concernent le ticket, pour la liste de choix. */
  available: CannedResponseForTicket[];
  /**
   * Celle qui pré-remplit le champ à l'ouverture, ou null si aucune ne le
   * demande. Elle figure aussi dans `available` : un agent qui efface le
   * brouillon doit pouvoir la rappeler.
   */
  autoInserted: CannedResponseForTicket | null;
};

/**
 * Les réponses proposées dans la zone de rédaction d'un ticket, dans l'ordre
 * alphabétique de leur titre.
 *
 * Le tri des filtres a lieu en mémoire et non en SQL : traduire « aucun filtre
 * sur cette dimension OU une valeur qui correspond » en requête donnerait une
 * clause illisible, pour un gain nul à cette échelle (quelques dizaines de
 * réponses type au total). La règle reste ainsi dans `matchesTicket`, à un seul
 * endroit et lisible.
 *
 * Fonction de bibliothèque et non Server Action : elle est appelée par la page
 * du ticket, côté serveur, avec un ticket déjà chargé et déjà autorisé.
 */
export async function listCannedResponsesForTicket(
  ticket: TicketScope,
  variables: CannedVariables,
): Promise<TicketCannedResponses> {
  const responses = await prisma.cannedResponse.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
    include: { filters: { select: { dimension: true, valueId: true } } },
  });

  const matching = responses.filter((response) => matchesTicket(response.filters, ticket));
  const autoInserted = pickAutoInserted(matching);

  return {
    available: matching.map((response) => forTicket(response, variables)),
    autoInserted: autoInserted && forTicket(autoInserted, variables),
  };
}

type StoredResponse = {
  id: string;
  title: string;
  body: string;
  autoInsert: boolean;
  filters: StoredFilter[];
};

function forTicket(response: StoredResponse, variables: CannedVariables): CannedResponseForTicket {
  return {
    id: response.id,
    title: response.title,
    body: fillCannedVariables(response.body, variables),
  };
}

/**
 * Laquelle pré-remplir quand plusieurs réponses le demandent sur le même ticket.
 *
 * La plus ciblée gagne, c'est-à-dire celle qui porte le plus de filtres : une
 * réponse écrite pour « produit Papairis + statut Nouveau » a été pensée pour ce
 * cas précis, là où une réponse sans filtre est un repli générique.
 *
 * À nombre de filtres égal, la première rencontrée l'emporte — donc la première
 * par ordre alphabétique de titre, puisque la requête trie déjà ainsi. Le
 * départage est arbitraire, mais il est STABLE : deux ouvertures du même ticket
 * ne doivent pas pré-remplir deux textes différents.
 */
function pickAutoInserted(matching: StoredResponse[]): StoredResponse | null {
  let best: StoredResponse | null = null;

  for (const response of matching) {
    if (!response.autoInsert) {
      continue;
    }
    if (best === null) {
      best = response;
      continue;
    }
    if (response.filters.length > best.filters.length) {
      best = response;
    }
  }

  return best;
}
