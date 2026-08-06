import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import {
  findLexicalCandidates,
  ticketComparisonSelect,
  type LexicalCandidate,
  type TicketForComparison,
} from "@/lib/ticket-similarity";

/**
 * Notation des doublons par le modèle de langage, posée sur le pré-filtre
 * lexical de `ticket-similarity.ts`.
 *
 * Le partage de vocabulaire ne suffit pas à conclure : « impossible d'exporter
 * les mandats » et « comment exporter les mandats ? » emploient les mêmes mots
 * et sont deux demandes différentes (une panne, une question d'usage). Inverser
 * le cas est tout aussi vrai — « le PDF sort vide » et « le document généré est
 * blanc » ne partagent presque rien et sont le même incident. C'est ce jugement
 * qu'on délègue au modèle, sur une poignée de candidats seulement.
 *
 * Le résultat est écrit en base (`TicketDuplicateSuggestion`) : un rapprochement
 * écarté par un agent ne doit pas revenir à chaque ouverture de la fiche.
 */

/** Réglage administrable : coupe complètement l'appel au fournisseur d'IA. */
export const DUPLICATE_DETECTION_KEY = "ai_duplicate_detection";

/** Score en deçà duquel on ne propose rien : une fusion à tort coûte plus qu'un doublon raté. */
export const SUGGESTION_THRESHOLD = 70;

/** Un nouveau passage avant ce délai renvoie simplement ce qui est déjà en base. */
const RESCAN_AFTER_HOURS = 24;

// Texte transmis au fournisseur, borné comme dans /api/ai/suggest.
const MAX_SUBJECT_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 1200;

const SYSTEM_PROMPT = `Tu assistes le support client d'Ideeri, éditeur de logiciels immobiliers.
On te donne un ticket de référence et une liste de tickets candidats.
Pour chaque candidat, estime la probabilité qu'il porte EXACTEMENT sur la même demande que le ticket de référence, c'est-à-dire qu'une seule et même réponse traiterait les deux.

Règles :
- Même sujet fonctionnel mais problème différent (une panne vs une question d'usage, deux dossiers clients distincts, deux périodes différentes) = ce n'est PAS un doublon.
- Reformulation du même incident, même si le vocabulaire diffère = c'est un doublon.
- Un même client qui redépose la même demande à quelques minutes ou quelques jours d'intervalle = doublon quasi certain.
- Deux clients différents signalant la même panne du même logiciel = doublon (une réponse identique leur ira).
- Dans le doute, note bas.

Réponds UNIQUEMENT par un tableau JSON, sans texte autour et sans bloc de code, au format :
[{"number": 12, "score": 0..100, "reason": "une phrase en français"}]
"reason" explique en une phrase courte pourquoi c'est (ou non) la même demande.`;

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * Ramène la note du modèle sur 0–100.
 *
 * Deux libertés qu'ils prennent tous malgré la consigne : rendre une proportion
 * (0.85 pour 85) et dépasser la borne haute. Non corrigées, la première fait
 * passer un doublon certain pour un score de 1 %.
 */
function normalizeScore(raw: number) {
  let score = raw;
  if (score > 0 && score <= 1) {
    score = score * 100;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Extrait le tableau JSON de la réponse du modèle.
 *
 * Les trois fournisseurs encadrent volontiers le JSON d'un ```json ou d'une
 * phrase d'introduction malgré la consigne : plutôt que de faire échouer la
 * détection sur un caractère parasite, on récupère la première structure de
 * tableau présente dans le texte.
 */
function parseScoredArray(raw: string): { number: number; score: number; reason: string }[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];

    const { number, score, reason } = entry as Record<string, unknown>;
    if (typeof number !== "number" || typeof score !== "number") return [];

    let explanation = "";
    if (typeof reason === "string") {
      explanation = truncate(reason.trim(), 300);
    }

    return [{ number, score: normalizeScore(score), reason: explanation }];
  });
}

export type ScoredDuplicate = LexicalCandidate & { score: number; reason: string };

/**
 * Soumet les candidats au modèle et rend ceux qui atteignent le seuil.
 *
 * Minimisation avant transmission à un sous-traitant tiers, comme pour la
 * suggestion de réponse : ni le fil de discussion, ni les notes internes, ni
 * l'identité des clients ne sortent — seuls le sujet et la demande initiale,
 * tronqués, sont nécessaires pour juger d'un doublon. Le rapprochement « même
 * client des deux côtés » est calculé en local et transmis comme un simple
 * booléen anonyme.
 */
async function scoreWithAi(
  ticket: TicketForComparison,
  candidates: LexicalCandidate[]
): Promise<ScoredDuplicate[]> {
  const config = await getAiConfig();
  if (!config.apiKey) return [];

  const candidateBlocks = candidates
    .map((candidate) => {
      let sameClientLine = "Déposé par le même client que la référence : non";
      if (candidate.sameClient) {
        sameClientLine = "Déposé par le même client que la référence : oui";
      }

      return [
        `Ticket candidat #${candidate.number}`,
        `Sujet : ${truncate(candidate.subject, MAX_SUBJECT_CHARS)}`,
        `Demande : ${truncate(candidate.description, MAX_DESCRIPTION_CHARS)}`,
        sameClientLine,
      ].join("\n");
    })
    .join("\n\n");

  const userPrompt = `Ticket de référence #${ticket.number}
Sujet : ${truncate(ticket.subject, MAX_SUBJECT_CHARS)}
Demande : ${truncate(ticket.description, MAX_DESCRIPTION_CHARS)}

Tickets candidats :

${candidateBlocks}

Note chaque candidat.`;

  const raw = await generateAiSuggestion(config, { systemPrompt: SYSTEM_PROMPT, userPrompt });

  const byNumber = new Map(candidates.map((candidate) => [candidate.number, candidate]));
  const matches: ScoredDuplicate[] = [];

  for (const { number, score, reason } of parseScoredArray(raw)) {
    // Un numéro inventé par le modèle ne doit rien produire : c'est une
    // proposition de fusion, elle ne peut porter que sur un ticket soumis.
    const candidate = byNumber.get(number);
    if (!candidate) continue;
    if (score < SUGGESTION_THRESHOLD) continue;

    let explanation = reason;
    if (!explanation) {
      explanation = "Demande jugée identique.";
    }

    matches.push({ ...candidate, score, reason: explanation });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/** Le ticket d'en face, décrit juste assez pour décider sans quitter la fiche. */
export type SuggestedTicket = {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  clientName: string | null;
  statusName: string;
};

/**
 * Rapprochement tel qu'il est présenté à l'agent, avec le sens de la fusion.
 *
 * `sourceId` est le ticket qui sera rattaché, `targetId` celui qui reste. Les
 * deux sont portés explicitement plutôt que déduits à l'affichage : c'est
 * exactement ce que la bannière doit annoncer, et une erreur de sens ici ferait
 * refermer le mauvais dossier.
 */
export type DuplicateSuggestion = {
  id: string;
  score: number;
  reason: string;
  /** L'autre ticket du rapprochement, celui que l'agent ne regarde pas. */
  other: SuggestedTicket;
  sourceId: string;
  targetId: string;
  /** `true` quand c'est l'autre ticket qui viendra se rattacher à celui-ci. */
  incoming: boolean;
};

const suggestedTicketSelect = {
  id: true,
  number: true,
  subject: true,
  createdAt: true,
  client: { select: { name: true } },
  status: { select: { name: true } },
} as const;

type SuggestedTicketRow = {
  id: string;
  number: number;
  subject: string;
  createdAt: Date;
  client: { name: string } | null;
  status: { name: string };
};

function toSuggestedTicket(row: SuggestedTicketRow): SuggestedTicket {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    createdAt: row.createdAt,
    clientName: row.client?.name ?? null,
    statusName: row.status.name,
  };
}

/**
 * Rapprochements en attente qui concernent ce ticket, dans les deux sens.
 *
 * Un rapprochement est toujours enregistré du plus récent vers le plus ancien
 * (voir `findLexicalCandidates`). Il doit pourtant se voir depuis les deux
 * fiches : sur le nouveau ticket, « cette demande rejoint le #12 » ; sur
 * l'ancien, « le #45 semble être un doublon de celui-ci ». Sans le second sens,
 * un agent qui travaille depuis le dossier de référence ne verrait jamais les
 * doublons qu'on lui a détectés.
 *
 * Les rapprochements devenus caducs (l'autre ticket a été fusionné ailleurs
 * entre-temps) sont écartés à la lecture plutôt que par un nettoyage : rien à
 * faire tourner en arrière-plan, et un agent ne voit jamais une proposition
 * impossible à suivre.
 */
export async function getPendingDuplicateSuggestions(
  ticketId: string
): Promise<DuplicateSuggestion[]> {
  const [outgoing, incoming] = await Promise.all([
    prisma.ticketDuplicateSuggestion.findMany({
      where: { ticketId, status: "PENDING", candidate: { mergedIntoId: null } },
      include: { candidate: { select: suggestedTicketSelect } },
      orderBy: { score: "desc" },
    }),
    prisma.ticketDuplicateSuggestion.findMany({
      where: { candidateId: ticketId, status: "PENDING", ticket: { mergedIntoId: null } },
      include: { ticket: { select: suggestedTicketSelect } },
      orderBy: { score: "desc" },
    }),
  ]);

  const suggestions: DuplicateSuggestion[] = [];

  for (const row of outgoing) {
    suggestions.push({
      id: row.id,
      score: row.score,
      reason: row.reason,
      other: toSuggestedTicket(row.candidate),
      sourceId: ticketId,
      targetId: row.candidateId,
      incoming: false,
    });
  }

  for (const row of incoming) {
    suggestions.push({
      id: row.id,
      score: row.score,
      reason: row.reason,
      other: toSuggestedTicket(row.ticket),
      sourceId: row.ticketId,
      targetId: ticketId,
      incoming: true,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

export type DuplicateScanResult = {
  suggestions: DuplicateSuggestion[];
  /** Pourquoi rien n'a été calculé, quand c'est le cas — remonté tel quel à l'agent. */
  skippedReason: string | null;
};

/**
 * Cherche les doublons d'un ticket et enregistre ce qui dépasse le seuil.
 *
 * Trois portes avant le moindre appel facturé : le réglage administrable, la
 * présence d'au moins un candidat lexical, et le délai depuis le dernier
 * passage. `force` (bouton « Rechercher les doublons ») ne franchit que la
 * dernière : sans clé API ni candidat, il n'y a rien à chercher.
 */
export async function scanTicketForDuplicates(
  ticketId: string,
  { force = false }: { force?: boolean } = {}
): Promise<DuplicateScanResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { ...ticketComparisonSelect, mergedIntoId: true, duplicateScanAt: true },
  });
  if (!ticket) {
    return { suggestions: [], skippedReason: "Ticket introuvable." };
  }
  if (ticket.mergedIntoId) {
    return { suggestions: [], skippedReason: "Ce ticket est déjà fusionné." };
  }

  const alreadyScanned =
    ticket.duplicateScanAt !== null &&
    Date.now() - ticket.duplicateScanAt.getTime() < RESCAN_AFTER_HOURS * 60 * 60 * 1000;
  if (alreadyScanned && !force) {
    return { suggestions: await getPendingDuplicateSuggestions(ticketId), skippedReason: null };
  }

  const enabled = await prisma.globalSetting.findUnique({ where: { key: DUPLICATE_DETECTION_KEY } });
  // Absent = activé : la fonctionnalité doit rendre service dès l'installation,
  // sans réglage à découvrir. Elle reste inerte tant qu'aucune clé API n'est
  // configurée, donc aucun appel n'est déclenché à l'insu de l'équipe.
  if (enabled?.value === "false") {
    return { suggestions: [], skippedReason: "Détection de doublons désactivée dans Paramètres > IA." };
  }

  const candidates = await findLexicalCandidates(ticket);

  // Dernière porte avant l'appel facturé, et la plus rentable : un candidat déjà
  // rapproché de ce ticket a déjà son verdict en base. Le resoumettre ferait
  // payer deux fois le même jugement.
  const alreadyJudged = await knownCounterparts(ticketId);
  const fresh = candidates.filter((candidate) => !alreadyJudged.has(candidate.id));

  if (fresh.length === 0) {
    // Passage à vide enregistré comme un autre : c'est justement le cas le plus
    // fréquent, et celui qu'il faut éviter de recalculer à chaque ouverture.
    // Un candidat déjà jugé compte pour un passage à vide — il n'y a rien de
    // nouveau à demander au modèle.
    await markScanned(ticketId);
    return { suggestions: await getPendingDuplicateSuggestions(ticketId), skippedReason: null };
  }

  let scored: ScoredDuplicate[];
  try {
    scored = await scoreWithAi(ticket, fresh);
  } catch (error) {
    if (error instanceof AiProviderError) {
      return { suggestions: await getPendingDuplicateSuggestions(ticketId), skippedReason: error.message };
    }
    throw error;
  }

  for (const match of scored) {
    // `upsert` et non `create` : le même rapprochement peut ressortir d'un
    // passage à l'autre. Un rapprochement déjà tranché par un agent (écarté ou
    // fusionné) garde son statut — seul le score est rafraîchi.
    try {
      await prisma.ticketDuplicateSuggestion.upsert({
        where: { ticketId_candidateId: { ticketId, candidateId: match.id } },
        update: { score: match.score, reason: match.reason },
        create: { ticketId, candidateId: match.id, score: match.score, reason: match.reason },
      });
    } catch (error) {
      // Le couple vient d'être enregistré dans l'autre sens par un passage
      // concurrent (deux agents ouvrant les deux fiches en même temps) : l'index
      // d'unicité sur le couple non ordonné refuse le miroir, et c'est ce qu'on
      // veut. Le rapprochement existe, il n'y a rien à signaler à l'agent.
      if (!isPairConflict(error)) throw error;
    }
  }

  await markScanned(ticketId);
  return { suggestions: await getPendingDuplicateSuggestions(ticketId), skippedReason: null };
}

/**
 * Tickets déjà rapprochés de celui-ci, DANS UN SENS COMME DANS L'AUTRE.
 *
 * Le sens compte pour l'affichage (qui se rattache à qui) mais pas pour la
 * question « ce couple a-t-il déjà été jugé ? ». Les regarder à sens unique
 * était le défaut : un ticket dont le doublon avait déjà été détecté depuis
 * l'autre fiche repassait au modèle, puis s'ajoutait en miroir — le même
 * rapprochement s'affichait alors deux fois sur la même fiche, avec deux scores
 * différents.
 *
 * Les rapprochements ÉCARTÉS comptent aussi, et c'est essentiel : une
 * proposition refusée par un agent ne doit pas revenir par l'autre bout du
 * couple. C'est la promesse faite dans le commentaire de
 * `TicketDuplicateSuggestion`, qui ne tenait que dans un seul sens.
 */
async function knownCounterparts(ticketId: string): Promise<Set<string>> {
  const rows = await prisma.ticketDuplicateSuggestion.findMany({
    where: { OR: [{ ticketId }, { candidateId: ticketId }] },
    select: { ticketId: true, candidateId: true },
  });

  return new Set(
    rows.map((row) => (row.ticketId === ticketId ? row.candidateId : row.ticketId)),
  );
}

/** Violation de l'unicité du couple (index `ticket_duplicate_suggestions_pair_key`). */
function isPairConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function markScanned(ticketId: string) {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { duplicateScanAt: new Date() },
  });
}
