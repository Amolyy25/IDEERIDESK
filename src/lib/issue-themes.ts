import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import { significantWords } from "@/lib/ticket-similarity";
import type { StatsRange } from "@/lib/stats-range";
import type { StatsFilters } from "@/lib/statistics";

/**
 * « De quoi nous parle-t-on le plus ? » — en deux temps, comme la détection de
 * doublons : un relevé lexical gratuit, puis un regroupement par le modèle de
 * langage sur demande.
 *
 * Le relevé lexical répond déjà à la question sous sa forme brute : les mots et
 * les paires de mots qui reviennent le plus dans les sujets de la période. Il est
 * calculé à chaque affichage, ne coûte rien, ne sort pas de l'application, et
 * fonctionne sans clé API. Sa limite est connue : « erreur » et « bug » comptent
 * séparément, et « impossible d'exporter » ne se rapproche pas de « l'export ne
 * marche pas ».
 *
 * C'est exactement ce que le regroupement par IA apporte : nommer un problème
 * plutôt que compter un mot. Il n'est PAS lancé au rendu de la page, et ce choix
 * est le même que celui de la bannière de doublons : un appel facturé au jeton ne
 * se déclenche pas parce que quelqu'un a ouvert un écran. Il part sur un clic, et
 * son résultat est gardé en mémoire le temps qu'il reste pertinent.
 *
 * Ce qui sort de l'application, et rien d'autre : le NUMÉRO et le SUJET de
 * chaque ticket, tronqué. Ni la demande, ni le fil, ni les notes internes, ni
 * l'identité du client — un thème se nomme à partir de l'intitulé des demandes.
 * Même principe de minimisation que `/api/ai/suggest` et `ticket-duplicates.ts`.
 */

// ---------------------------------------------------------------------------
// Population lue
// ---------------------------------------------------------------------------

/**
 * Sujets relus pour le relevé lexical. Large, parce que le comptage est local et
 * qu'un mot fréquent ne se voit que sur du volume.
 */
const LEXICAL_SAMPLE = 4_000;

/**
 * Sujets soumis au modèle. Volontairement bien plus bas : c'est ce qui borne le
 * coût de l'appel, et un thème récurrent apparaît dans les cent derniers tickets
 * s'il est vraiment récurrent.
 */
const AI_SAMPLE = 150;

/** Longueur d'un sujet transmis au fournisseur. */
const MAX_SUBJECT_CHARS = 160;

/** Thèmes rendus au maximum : au-delà, ce n'est plus un classement mais une liste. */
const MAX_THEMES = 8;

/**
 * Durée de validité du regroupement en mémoire. La question posée (« quels sont
 * nos problèmes récurrents ? ») ne change pas d'une heure à l'autre ; relancer le
 * modèle à chaque clic ferait payer deux fois la même réponse.
 *
 * En mémoire du processus, comme `rate-limit.ts` et pour la même raison : un
 * déploiement à plusieurs instances rendrait ce cache local à chacune — c'est
 * acceptable ici, chaque instance ne faisant alors qu'un appel de plus.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Entrées gardées : le cache suit les périodes consultées, pas l'historique. */
const CACHE_MAX_ENTRIES = 24;

export type IssueTerm = {
  term: string;
  /** Nombre de TICKETS où le terme apparaît (et non nombre d'occurrences). */
  tickets: number;
  share: number;
};

export type IssueSignals = {
  /** Mots seuls les plus fréquents dans les sujets. */
  words: IssueTerm[];
  /** Paires de mots consécutifs — beaucoup plus parlantes qu'un mot isolé. */
  phrases: IssueTerm[];
  /** Sujets réellement analysés (plafonnés à `LEXICAL_SAMPLE`). */
  analyzed: number;
  /** La période contenait plus de tickets que le plafond de lecture. */
  truncated: boolean;
};

export type IssueTheme = {
  label: string;
  /** Ce que le modèle a compris du problème, en une phrase. */
  insight: string;
  /** Tickets rattachés, retenus seulement s'ils faisaient partie de l'envoi. */
  ticketNumbers: number[];
  count: number;
  share: number;
};

export type IssueThemeAnalysis = {
  themes: IssueTheme[];
  /** Sujets soumis au modèle. */
  analyzedCount: number;
  /** Soumis mais rattachés à aucun thème : ni regroupables, ni isolés à tort. */
  unclassifiedCount: number;
  model: string;
  generatedAt: Date;
  /** Résultat servi depuis le cache mémoire plutôt que recalculé. */
  fromCache: boolean;
};

type SubjectRow = { number: number; subject: string };

async function loadSubjects(
  range: StatsRange,
  filters: StatsFilters,
  limit: number,
): Promise<SubjectRow[]> {
  return prisma.ticket.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      // Les doublons déjà rattachés à un autre dossier sont écartés : la même
      // demande comptée deux fois gonflerait artificiellement son thème, alors
      // que l'équipe ne l'a traitée qu'une fois.
      mergedIntoId: null,
    },
    select: { number: true, subject: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Relevé lexical (aucun appel externe)
// ---------------------------------------------------------------------------

/**
 * Mots et paires de mots qui reviennent le plus dans les sujets de la période.
 *
 * Compté en TICKETS et non en occurrences : un sujet qui répète trois fois
 * « facture » ne pèse pas trois demandes. C'est la même unité que partout
 * ailleurs sur la page, ce qui permet de lire « 12 tickets sur 80 » plutôt qu'un
 * nombre d'apparitions sans dénominateur.
 *
 * Les mots vides et les formules de politesse sont retirés par
 * `significantWords`, déjà écrit pour le pré-filtre de doublons — sans quoi
 * « bonjour » serait notre problème le plus fréquent.
 */
export async function getIssueSignals(
  range: StatsRange,
  filters: StatsFilters = {},
): Promise<IssueSignals> {
  const rows = await loadSubjects(range, filters, LEXICAL_SAMPLE);

  const wordTickets = new Map<string, number>();
  const phraseTickets = new Map<string, number>();

  for (const row of rows) {
    const words = [...significantWords(row.subject)];
    for (const word of words) {
      wordTickets.set(word, (wordTickets.get(word) ?? 0) + 1);
    }

    // Les paires sont formées sur l'ORDRE du sujet, pas sur l'ensemble trié :
    // « export mandats » et « mandats export » désignent la même chose, mais
    // seule la suite réellement écrite fait une expression lisible.
    const ordered = orderedSignificantWords(row.subject);
    const seen = new Set<string>();
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const phrase = `${ordered[index]} ${ordered[index + 1]}`;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      phraseTickets.set(phrase, (phraseTickets.get(phrase) ?? 0) + 1);
    }
  }

  const total = rows.length;

  return {
    words: rankTerms(wordTickets, total, 2),
    // Une paire vue une seule fois n'est pas un motif, c'est une phrase. Le seuil
    // est plus haut que pour les mots seuls, qui sont mécaniquement plus fréquents.
    phrases: rankTerms(phraseTickets, total, 3),
    analyzed: total,
    truncated: total >= LEXICAL_SAMPLE,
  };
}

/** Mots porteurs de sens, dans l'ordre du texte (voir `significantWords`). */
function orderedSignificantWords(value: string): string[] {
  const meaningful = significantWords(value);
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => meaningful.has(word));
}

const TERMS_SHOWN = 10;

function rankTerms(counts: Map<string, number>, total: number, floor: number): IssueTerm[] {
  return [...counts.entries()]
    .filter(([, tickets]) => tickets >= floor)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, TERMS_SHOWN)
    .map(([term, tickets]) => ({
      term,
      tickets,
      share: total > 0 ? tickets / total : 0,
    }));
}

// ---------------------------------------------------------------------------
// Regroupement par le modèle de langage
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Tu assistes le support client d'Ideeri, éditeur de logiciels immobiliers.
On te donne une liste de sujets de tickets, chacun précédé de son numéro.
Regroupe-les par PROBLÈME RÉEL, c'est-à-dire par ce qu'il faudrait corriger ou expliquer une seule fois pour traiter tout le groupe.

Règles :
- Au maximum ${MAX_THEMES} thèmes, du plus fréquent au moins fréquent.
- Un thème doit rassembler au moins deux tickets. Une demande isolée n'est pas un thème : ne la rattache à rien.
- Un même ticket appartient à un seul thème, le plus précis.
- Nomme le thème par le problème, en 2 à 6 mots, sans le mot « ticket » ni « problème » (ex. « Export des mandats en échec », « Réinitialisation de mot de passe »).
- Ne regroupe pas par logiciel ni par client : deux pannes différentes du même produit sont deux thèmes.
- N'invente aucun numéro : n'utilise que ceux fournis.

Réponds UNIQUEMENT par un tableau JSON, sans texte autour et sans bloc de code, au format :
[{"label":"…","insight":"une phrase en français","tickets":[12,45]}]
"insight" dit ce que ces demandes ont en commun et, si c'est visible, ce qui les déclenche.`;

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

type RawTheme = { label: string; insight: string; tickets: number[] };

/**
 * Extrait le tableau JSON de la réponse du modèle.
 *
 * Même précaution que `ticket-duplicates.ts` : les trois fournisseurs encadrent
 * volontiers le JSON d'un ```json ou d'une phrase d'introduction malgré la
 * consigne. On récupère donc la première structure de tableau du texte plutôt que
 * d'échouer sur un caractère parasite.
 */
function parseThemes(raw: string): RawTheme[] {
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
    const { label, insight, tickets } = entry as Record<string, unknown>;
    if (typeof label !== "string" || label.trim() === "") return [];

    const numbers = Array.isArray(tickets)
      ? tickets.filter((value): value is number => typeof value === "number")
      : [];

    return [
      {
        label: truncate(label.trim(), 80),
        insight: typeof insight === "string" ? truncate(insight.trim(), 300) : "",
        tickets: numbers,
      },
    ];
  });
}

type CacheEntry = { analysis: IssueThemeAnalysis; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function cacheKey(range: StatsRange, filters: StatsFilters) {
  return [
    range.from.getTime(),
    range.to.getTime(),
    filters.categoryId ?? "all",
  ].join(":");
}

function readCache(key: string): IssueThemeAnalysis | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { ...entry.analysis, fromCache: true };
}

function writeCache(key: string, analysis: IssueThemeAnalysis) {
  // Purge de la plus ancienne entrée plutôt qu'un cache qui grandit sans fin :
  // chaque période consultée en crée une, et la page en propose sept d'un clic.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { analysis, expiresAt: Date.now() + CACHE_TTL_MS });
}

export type IssueThemeResult = {
  analysis: IssueThemeAnalysis | null;
  /** Pourquoi rien n'a été calculé, remonté tel quel à l'écran. */
  skippedReason: string | null;
};

/**
 * Regroupe les demandes de la période en thèmes nommés.
 *
 * `force` refait l'appel malgré le cache : c'est le bouton « Relancer
 * l'analyse », utile après une journée chargée. Les comptes ne sont JAMAIS ceux
 * annoncés par le modèle — ils sont recalculés depuis les numéros qu'il rattache,
 * après avoir écarté ceux qu'il aurait inventés ou rattachés deux fois. Un modèle
 * qui compte mal est un modèle qui se trompe silencieusement.
 */
export async function analyzeIssueThemes(
  range: StatsRange,
  filters: StatsFilters = {},
  { force = false }: { force?: boolean } = {},
): Promise<IssueThemeResult> {
  const key = cacheKey(range, filters);
  if (!force) {
    const cached = readCache(key);
    if (cached) return { analysis: cached, skippedReason: null };
  }

  const config = await getAiConfig();
  if (!config.apiKey) {
    return {
      analysis: null,
      skippedReason: "Aucune clé API IA configurée. Rendez-vous dans Paramètres > IA.",
    };
  }

  const rows = await loadSubjects(range, filters, AI_SAMPLE);
  if (rows.length < 3) {
    return {
      analysis: null,
      skippedReason: "Pas assez de tickets sur cette période pour dégager un motif.",
    };
  }

  const userPrompt = `Sujets des ${rows.length} derniers tickets de la période :

${rows.map((row) => `#${row.number} ${truncate(row.subject, MAX_SUBJECT_CHARS)}`).join("\n")}

Regroupe ces demandes par problème.`;

  let raw: string;
  try {
    raw = await generateAiSuggestion(config, { systemPrompt: SYSTEM_PROMPT, userPrompt });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return { analysis: null, skippedReason: error.message };
    }
    throw error;
  }

  const submitted = new Set(rows.map((row) => row.number));
  const alreadyClassified = new Set<number>();
  const themes: IssueTheme[] = [];

  for (const theme of parseThemes(raw)) {
    // Le plafond est appliqué ICI et non par un `slice` final : un thème écarté
    // ne doit pas emporter ses tickets dans les « classés », sinon le compte des
    // demandes non rattachées annoncerait moins que la réalité.
    if (themes.length >= MAX_THEMES) break;

    // Numéros retenus : soumis, et pas déjà rattachés ailleurs. Le premier thème
    // qui réclame un ticket le garde — c'est aussi celui que le modèle a jugé le
    // plus fréquent, l'ordre de sa réponse étant demandé décroissant.
    const numbers = theme.tickets.filter(
      (number) => submitted.has(number) && !alreadyClassified.has(number),
    );
    if (numbers.length < 2) continue;

    for (const number of numbers) alreadyClassified.add(number);
    themes.push({
      label: theme.label,
      insight: theme.insight,
      ticketNumbers: numbers,
      count: numbers.length,
      share: numbers.length / rows.length,
    });
  }

  themes.sort((a, b) => b.count - a.count);

  const analysis: IssueThemeAnalysis = {
    themes,
    analyzedCount: rows.length,
    unclassifiedCount: rows.length - alreadyClassified.size,
    model: config.model,
    generatedAt: new Date(),
    fromCache: false,
  };

  writeCache(key, analysis);
  return { analysis, skippedReason: null };
}
