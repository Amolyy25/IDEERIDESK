/**
 * La plage de temps des statistiques : sa lecture depuis l'URL, la période de
 * comparaison, et le découpage de l'axe du temps.
 *
 * Module PUR et sans `"use server"`, pour la même raison que `sla.ts` : la barre
 * de période est un composant client (elle écrit dans l'URL), les requêtes sont
 * du code serveur, et les deux doivent s'accorder sur ce que « 30 derniers
 * jours » veut dire. Un préréglage défini deux fois finirait par désigner deux
 * périodes différentes, et la page annoncerait alors un intitulé qui ne
 * correspond pas aux chiffres affichés.
 *
 * Tout se calcule en heure LOCALE DU SERVEUR, comme les bornes du journal d'audit
 * et comme l'affichage des dates partout ailleurs dans l'application
 * (`formatDateTime` n'impose aucun fuseau). C'est ce qui garantit qu'une journée
 * découpée ici coïncide avec les heures lues sur la fiche d'un ticket.
 *
 * À savoir côté exploitation : le réglage « Fuseau horaire » de /settings/general
 * ne s'applique QU'aux horaires ouvrés du SLA (voir `sla.ts`), pas à cette page.
 * Sur un conteneur qui tourne en UTC — le défaut de la plupart des plateformes,
 * Railway compris — « aujourd'hui » commence donc à 2 h du matin en été, et la
 * carte d'activité décale ses créneaux d'autant. Le réglage à poser est celui de
 * l'environnement (`TZ=Europe/Paris`), qui remet du même coup toutes les dates de
 * l'application à l'heure de l'équipe.
 */

export const STATS_RANGE_KEYS = [
  "today",
  "7d",
  "30d",
  "90d",
  "month",
  "last-month",
  "12m",
  "custom",
] as const;

export type StatsRangeKey = (typeof STATS_RANGE_KEYS)[number];

/** Préréglages proposés dans la barre de période, dans l'ordre d'affichage. */
export const STATS_RANGE_PRESETS: { key: StatsRangeKey; label: string; short: string }[] = [
  { key: "today", label: "Aujourd'hui", short: "Auj." },
  { key: "7d", label: "7 derniers jours", short: "7 j" },
  { key: "30d", label: "30 derniers jours", short: "30 j" },
  { key: "90d", label: "90 derniers jours", short: "90 j" },
  { key: "month", label: "Mois en cours", short: "Ce mois" },
  { key: "last-month", label: "Mois dernier", short: "Mois -1" },
  { key: "12m", label: "12 derniers mois", short: "12 mois" },
];

/** Pas de l'axe du temps. Choisi d'après la durée, jamais saisi. */
export type StatsBucketUnit = "hour" | "day" | "week" | "month";

export type StatsRange = {
  key: StatsRangeKey;
  /** Intitulé affiché en tête de page, tel qu'il doit se lire. */
  label: string;
  /** Début inclus. */
  from: Date;
  /** Fin incluse (dernière milliseconde de la journée `to`). */
  to: Date;
  /**
   * Période immédiatement antérieure et de même durée : c'est elle qui donne un
   * sens aux écarts affichés sur les tuiles. « 42 nouveaux tickets » ne dit rien
   * seul ; « 42, soit +12 % » dit quelque chose.
   */
  previousFrom: Date;
  previousTo: Date;
  bucket: StatsBucketUnit;
  /** Bornes brutes à réécrire dans l'URL pour une période personnalisée. */
  customFrom: string | null;
  customTo: string | null;
};

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** `YYYY-MM-DD` → date locale, ou `null` si la saisie n'est pas une date. */
function parseDay(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDayInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isRangeKey(value: string | undefined): value is StatsRangeKey {
  return STATS_RANGE_KEYS.includes(value as StatsRangeKey);
}

/**
 * Pas de l'axe choisi d'après la durée, et non par un réglage : une journée se
 * lit heure par heure, un an mois par mois, et dans les deux cas c'est le seul
 * découpage qui tienne dans la largeur d'une carte. Trente-et-une colonnes est
 * la limite haute retenue (un mois plein en jours) ; au-delà on passe à la
 * semaine, puis au mois.
 */
function bucketFor(from: Date, to: Date): StatsBucketUnit {
  const spanDays = (to.getTime() - from.getTime()) / DAY_MS;
  if (spanDays <= 2) return "hour";
  if (spanDays <= 31) return "day";
  if (spanDays <= 126) return "week";
  return "month";
}

/**
 * La période demandée, résolue une fois pour toutes.
 *
 * Une saisie illisible retombe sur le préréglage par défaut plutôt que de
 * lever : l'URL est modifiable à la main, et une date mal tapée ne doit pas
 * renvoyer une page d'erreur là où trente jours de statistiques feraient
 * l'affaire.
 */
export function resolveStatsRange(params: {
  range?: string;
  from?: string;
  to?: string;
}): StatsRange {
  const now = new Date();
  const requested = isRangeKey(params.range) ? params.range : "30d";

  const customFrom = parseDay(params.from);
  const customTo = parseDay(params.to);

  // Une borne saisie l'emporte sur le préréglage : elle est plus explicite. Une
  // SEULE suffit — « depuis le 1er janvier » est une demande complète, l'autre
  // borne étant alors aujourd'hui. Ignorer une borne isolée laissait une date
  // dans l'URL sans effet sur les chiffres, ce qui est le pire des deux.
  if (requested === "custom" || customFrom || customTo) {
    const requestedFrom = startOfDay(customFrom ?? new Date(now.getTime() - 29 * DAY_MS));
    const requestedTo = endOfDay(customTo ?? now);

    // Bornes inversées remises dans l'ordre plutôt que refusées : c'est une
    // faute de frappe courante, et l'intention (« ces deux dates ») ne fait
    // aucun doute.
    const inverted = requestedTo.getTime() < requestedFrom.getTime();
    const from = inverted ? startOfDay(requestedTo) : requestedFrom;
    const to = inverted ? endOfDay(requestedFrom) : requestedTo;

    return withPrevious({
      key: "custom",
      label: `Du ${formatDay(from)} au ${formatDay(to)}`,
      from,
      to,
      customFrom: toDayInput(from),
      customTo: toDayInput(to),
    });
  }

  const preset = STATS_RANGE_PRESETS.find((item) => item.key === requested);
  const label = preset?.label ?? "30 derniers jours";

  if (requested === "today") {
    return withPrevious({ key: requested, label, from: startOfDay(now), to: endOfDay(now) });
  }

  if (requested === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return withPrevious({ key: requested, label, from, to: endOfDay(now) });
  }

  if (requested === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return withPrevious({ key: requested, label, from, to });
  }

  if (requested === "12m") {
    // Douze mois complets, mois en cours inclus : on part du 1er du mois qui
    // tombe onze mois plus tôt, pour que l'axe montre douze colonnes entières et
    // non onze plus deux moitiés.
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return withPrevious({ key: requested, label, from, to: endOfDay(now) });
  }

  const days = requested === "7d" ? 7 : requested === "90d" ? 90 : 30;
  // `days - 1` : « 7 derniers jours » compte aujourd'hui, sans quoi la période
  // couvrirait huit journées.
  const from = startOfDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  return withPrevious({ key: requested, label, from, to: endOfDay(now) });
}

/** Complète une période de sa jumelle antérieure et du pas de son axe. */
function withPrevious(
  range: Omit<StatsRange, "previousFrom" | "previousTo" | "bucket" | "customFrom" | "customTo"> & {
    customFrom?: string | null;
    customTo?: string | null;
  },
): StatsRange {
  const span = range.to.getTime() - range.from.getTime();

  return {
    ...range,
    customFrom: range.customFrom ?? null,
    customTo: range.customTo ?? null,
    // Collée à la période affichée, et de durée identique à la milliseconde :
    // comparer trente jours à un mois calendaire ferait varier l'écart selon
    // qu'on est en février ou en mars.
    previousFrom: new Date(range.from.getTime() - span - 1),
    previousTo: new Date(range.from.getTime() - 1),
    bucket: bucketFor(range.from, range.to),
  };
}

// ---------------------------------------------------------------------------
// Découpage de l'axe du temps
// ---------------------------------------------------------------------------

export type StatsBucket = {
  /** Clé de regroupement, calculée aussi pour chaque ticket (voir `bucketKey`). */
  key: string;
  /** Libellé complet, pour l'infobulle et les lecteurs d'écran. */
  label: string;
  /** Libellé court de l'axe, affiché une colonne sur N. */
  tick: string;
  start: Date;
};

/**
 * Colonnes de l'axe, dans l'ordre, y compris celles restées à zéro.
 *
 * Les vides comptent : un graphique qui saute les journées sans ticket rendrait
 * un week-end calme visuellement identique à une semaine chargée.
 */
export function buildStatsBuckets(range: StatsRange): StatsBucket[] {
  const buckets: StatsBucket[] = [];
  let cursor = bucketStart(range.from, range.bucket);
  const end = range.to.getTime();

  // Borne de sécurité : une plage personnalisée de plusieurs années en pas
  // journalier produirait des milliers de colonnes illisibles. Le pas passe déjà
  // au mois au-delà de quatre mois, ce garde-fou ne sert donc qu'aux saisies
  // aberrantes (« du 01/01/1970 à aujourd'hui »).
  while (cursor.getTime() <= end && buckets.length < 400) {
    buckets.push({
      key: bucketKey(cursor, range.bucket),
      label: bucketLabel(cursor, range.bucket),
      tick: bucketTick(cursor, range.bucket),
      start: new Date(cursor),
    });
    cursor = nextBucket(cursor, range.bucket);
  }

  return buckets;
}

function bucketStart(date: Date, unit: StatsBucketUnit): Date {
  if (unit === "hour") {
    const copy = new Date(date);
    copy.setMinutes(0, 0, 0);
    return copy;
  }
  if (unit === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  if (unit === "week") {
    const copy = startOfDay(date);
    // Semaines calées sur le lundi : c'est la semaine telle qu'une équipe
    // française la lit, et le dimanche comme premier jour couperait chaque
    // week-end en deux.
    const isoWeekday = copy.getDay() === 0 ? 7 : copy.getDay();
    copy.setDate(copy.getDate() - (isoWeekday - 1));
    return copy;
  }
  return startOfDay(date);
}

function nextBucket(start: Date, unit: StatsBucketUnit): Date {
  const copy = new Date(start);
  if (unit === "hour") copy.setHours(copy.getHours() + 1);
  else if (unit === "day") copy.setDate(copy.getDate() + 1);
  else if (unit === "week") copy.setDate(copy.getDate() + 7);
  else copy.setMonth(copy.getMonth() + 1);
  return copy;
}

/**
 * Clé du seau auquel appartient une date. Calculée à l'identique pour les
 * colonnes et pour chaque ticket : c'est ce qui remplace une jointure temporelle
 * en SQL par un simple regroupement en mémoire.
 */
export function bucketKey(date: Date, unit: StatsBucketUnit): string {
  const start = bucketStart(date, unit);
  if (unit === "hour") return `${toDayInput(start)}T${String(start.getHours()).padStart(2, "0")}`;
  if (unit === "month") return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return toDayInput(start);
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const shortDayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const shortMonthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

function formatDay(date: Date) {
  return dayFormatter.format(date);
}

function bucketLabel(start: Date, unit: StatsBucketUnit): string {
  if (unit === "hour") return `${formatDay(start)}, ${String(start.getHours()).padStart(2, "0")} h`;
  if (unit === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `Semaine du ${formatDay(start)} au ${formatDay(end)}`;
  }
  if (unit === "month") return capitalize(monthFormatter.format(start));
  return capitalize(new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start));
}

function bucketTick(start: Date, unit: StatsBucketUnit): string {
  if (unit === "hour") return `${String(start.getHours()).padStart(2, "0")} h`;
  if (unit === "month") return capitalize(shortMonthFormatter.format(start).replace(".", ""));
  return shortDayFormatter.format(start).replace(".", "");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** « du 12 mars au 10 avril 2026 » — la période écrite sous le titre de la page. */
export function formatRangeSpan(range: StatsRange): string {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const from = formatter.format(range.from);
  const to = formatter.format(range.to);
  if (from === to) return from;
  return `du ${from} au ${to}`;
}
