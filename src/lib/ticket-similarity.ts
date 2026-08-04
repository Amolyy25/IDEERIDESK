import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Pré-filtre lexical des doublons — la moitié gratuite de la détection.
 *
 * Soumettre au modèle de langage tous les tickets ouverts serait à la fois
 * ruineux et inutile : sur une file de plusieurs centaines de dossiers, deux
 * demandes identiques partagent presque toujours du vocabulaire (« export »,
 * « facture », un message d'erreur, un nom de logiciel). Ce module ramène donc
 * la comparaison à une poignée de candidats plausibles, et c'est seulement sur
 * eux que l'IA tranche (voir `ticket-duplicates.ts`).
 *
 * Aucune donnée ne sort de l'application ici : tout se joue en base et en
 * mémoire.
 */

/** Fenêtre de recherche : au-delà, deux demandes qui se ressemblent sont deux demandes. */
const CANDIDATE_WINDOW_DAYS = 30;

/** Tickets relus en base avant notation locale. Borne le coût de la requête. */
const CANDIDATE_POOL = 120;

/** Nombre de candidats retenus, au maximum, pour la suite (notation IA). */
export const MAX_CANDIDATES = 8;

/**
 * Score lexical en dessous duquel on ne dérange pas le modèle. Volontairement
 * bas : le pré-filtre écarte le bruit évident, il ne décide pas du doublon.
 */
export const LEXICAL_FLOOR = 0.12;

// Mots vides français et anglais, plus le vocabulaire de politesse omniprésent
// dans les demandes de support : sans ce retrait, « bonjour je voudrais » suffit
// à rapprocher deux tickets qui n'ont rien à voir.
const STOPWORDS = new Set([
  "alors", "aucun", "aussi", "autre", "avec", "avoir", "avons", "bien", "bonjour", "bonsoir",
  "cela", "cette", "chez", "comme", "comment", "cordialement", "dans", "depuis", "des", "deux",
  "dois", "donc", "dont", "elle", "elles", "encore", "est", "etre", "eux", "faire", "fait",
  "faut", "les", "leur", "lors", "madame", "mais", "merci", "mes", "meme", "moi", "mon",
  "monsieur", "nos", "notre", "nous", "par", "pas", "peut", "plus", "pour", "pourriez",
  "pouvez", "pourquoi", "prie", "quand", "que", "quel", "quelle", "qui", "quoi", "salutations",
  "sans", "ses", "son", "sont", "sous", "sur", "tous", "tout", "toute", "tres", "une", "vers",
  "veux", "voir", "vos", "votre", "vous", "and", "are", "for", "from", "have", "hello", "not",
  "please", "regards", "thanks", "that", "the", "this", "with", "you", "your",
]);

/** Minuscules, accents retirés, ponctuation en espaces : « Problème » = « probleme ». */
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mots porteurs de sens d'un texte. Les mots de moins de 3 lettres tombent avec
 * les mots vides — ils n'apportent rien et faussent les recoupements.
 */
export function significantWords(value: string): Set<string> {
  const words = normalize(value).split(" ");
  return new Set(words.filter((word) => word.length >= 3 && !STOPWORDS.has(word)));
}

/**
 * Recouvrement de vocabulaire entre deux ensembles de mots, rapporté au plus
 * petit des deux (et non à leur union comme un Jaccard classique).
 *
 * Choix délibéré : une demande d'une ligne (« impossible d'exporter les
 * mandats ») et le même problème raconté en trois paragraphes sont le même
 * ticket. Un Jaccard les séparerait uniquement parce que le second est plus
 * long — exactement le cas que cette fonctionnalité doit rattraper.
 */
function overlapRatio(a: Set<string>, b: Set<string>) {
  let smaller = a;
  let larger = b;
  if (b.size < a.size) {
    smaller = b;
    larger = a;
  }

  if (smaller.size === 0) return 0;

  let shared = 0;
  for (const word of smaller) {
    if (larger.has(word)) shared += 1;
  }
  return shared / smaller.size;
}

export type TicketForComparison = {
  id: string;
  number: number;
  subject: string;
  description: string;
  categoryId: string | null;
  clientId: string | null;
  createdAt: Date;
  client: { name: string; email: string } | null;
};

export type LexicalCandidate = TicketForComparison & {
  /** 0 à 1. Sert à classer et à décider d'un appel IA, pas à conclure. */
  lexicalScore: number;
  /** Même personne des deux côtés : un doublon involontaire, le cas le plus fréquent. */
  sameClient: boolean;
};

const comparisonSelect = {
  id: true,
  number: true,
  subject: true,
  description: true,
  categoryId: true,
  clientId: true,
  createdAt: true,
  client: { select: { name: true, email: true } },
} satisfies Prisma.TicketSelect;

/**
 * Combine les signaux disponibles sans IA. Le sujet pèse plus que le corps :
 * c'est la phrase que le client a écrite pour résumer sa demande, donc le
 * meilleur résumé disponible.
 */
function lexicalScore(
  subject: number,
  body: number,
  { sameClient, sameCategory }: { sameClient: boolean; sameCategory: boolean }
) {
  let score = subject * 0.6 + body * 0.4;
  // Deux demandes du même client à quelques jours d'intervalle : le doublon
  // accidentel décrit par l'équipe (« la personne a validé deux fois »).
  if (sameClient) score += 0.15;
  if (sameCategory) score += 0.05;
  return Math.min(1, score);
}

/**
 * Tickets susceptibles de faire doublon avec celui-ci, du plus proche au plus
 * lointain.
 *
 * Uniquement des tickets ANTÉRIEURS, et c'est une décision de fond : le
 * rapprochement doit toujours désigner le dossier de référence, et c'est le plus
 * ancien — il porte déjà l'historique, l'assignation et parfois des réponses
 * envoyées. Chercher aussi vers l'avenir produirait des propositions à
 * l'envers, où le ticket établi irait se fondre dans le dernier arrivé.
 *
 * Écartés également : le ticket lui-même, ceux déjà fusionnés dans un autre
 * dossier, et tout ce qui sort de la fenêtre de recherche. Un ticket qui a déjà
 * absorbé des doublons reste candidat, lui — c'est même le meilleur : le
 * troisième client à signaler la même panne doit rejoindre les deux premiers.
 */
export async function findLexicalCandidates(
  ticket: TicketForComparison,
  { limit = MAX_CANDIDATES }: { limit?: number } = {}
): Promise<LexicalCandidate[]> {
  const since = new Date(ticket.createdAt.getTime() - CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pool = await prisma.ticket.findMany({
    where: {
      id: { not: ticket.id },
      mergedIntoId: null,
      createdAt: { gte: since, lt: ticket.createdAt },
    },
    select: comparisonSelect,
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_POOL,
  });

  const subjectWords = significantWords(ticket.subject);
  const bodyWords = significantWords(`${ticket.subject} ${ticket.description}`);

  return pool
    .map((candidate) => {
      const sameClient = Boolean(ticket.clientId) && candidate.clientId === ticket.clientId;
      const sameCategory = Boolean(ticket.categoryId) && candidate.categoryId === ticket.categoryId;

      return {
        ...candidate,
        sameClient,
        lexicalScore: lexicalScore(
          overlapRatio(subjectWords, significantWords(candidate.subject)),
          overlapRatio(bodyWords, significantWords(`${candidate.subject} ${candidate.description}`)),
          { sameClient, sameCategory }
        ),
      };
    })
    .filter((candidate) => candidate.lexicalScore >= LEXICAL_FLOOR)
    .sort((a, b) => b.lexicalScore - a.lexicalScore)
    .slice(0, limit);
}

export { comparisonSelect as ticketComparisonSelect };
