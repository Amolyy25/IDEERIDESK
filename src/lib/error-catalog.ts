// Pannes connues, traduites en « ce qui se passe » et « quoi faire ».
//
// En production Next réécrit le message des erreurs serveur et ne laisse qu'un
// `digest` : la reconnaissance par message ne vaut que côté client et en
// développement. D'où le cas par défaut, qui affiche la référence à transmettre.

export type KnownError = {
  id: string;
  title: string;
  /** Ce qui se passe, et pourquoi quand on le sait. */
  cause: string;
  /** Ce que l'agent peut tenter, dans l'ordre. */
  actions: string[];
  /** Un rechargement a une chance de suffire — sinon le bouton ment. */
  canReload: boolean;
  /** Maillon rompu dans la chaîne navigateur → Desk → base. `null` : la panne n'est pas technique. */
  failsAt: "browser" | "app" | "database" | null;
  /** Ce que l'incident touche, annoncé en tête d'écran. */
  domain: string;
};

const CONTACT = "Si l'écran revient, envoyez la référence ci-dessous au big boss de l'app evidement le A le M.";

const CATALOG: Array<KnownError & { pattern: RegExp }> = [
  {
    id: "database-unreachable",
    failsAt: "database",
    domain: "Base de données",
    pattern: /can't reach database server|P1001|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
    title: "La base de données ne répond pas",
    cause:
      "L'application n'arrive pas à joindre le serveur de base de données. C'est presque toujours passager : une coupure réseau, ou l'hébergeur qui redémarre.",
    actions: [
      "Attendez quelques secondes, puis rechargez la page.",
      "Si l’écran réapparaît trois fois de suite, je vous autorise à crier dans le bureau.\n",
    ],
    canReload: true,
  },
  {
    id: "database-pool-exhausted",
    failsAt: "database",
    domain: "Base de données",
    pattern: /P2024|timed out fetching a new connection|too many connections/i,
    title: "Trop de requêtes en même temps",
    cause:
      "La base de données est surchargée par vos requêtes et celles des autres utilisateurs. La seule solution est d’attendre… Ça arrive quand plusieurs onglets travaillent en parallèle.",
    actions: [
      "Fermez les onglets d'Ideeri Desk que vous n'utilisez pas, puis rechargez.",
      CONTACT,
    ],
    canReload: true,
  },
  {
    id: "database-schema-mismatch",
    failsAt: "app",
    domain: "Version déployée",
    pattern:
      /unknown argument|PrismaClientValidationError|does not exist in the current database|column .* does not exist/i,
    title: "L'application et la base ne sont plus d'accord",
    cause:
      "Une donnée demandée n'existe pas côté base de donnée, le serveur tourne sur une version différente de celle de la base de donnée. Ça ne se produit qu'après une mise en ligne.",
    actions: [
      "Recharger n'y changera rien, et vider le cache non plus.",
      "Prévenez le big bogosse Amaury avec la référence ci-dessous.",
    ],
    canReload: false,
  },
  {
    id: "stale-chunk",
    failsAt: "browser",
    domain: "Votre navigateur",
    pattern:
      /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i,
    title: "Cet onglet tourne sur une version qui n'est plus en ligne",
    cause:
      "Une nouvelle version d'Ideeri Desk a été déployée pendant que cet onglet était ouvert. Les fichiers gardés par votre navigateur n'existent plus sur le serveur.",
    actions: [
      "Rechargez la page.",
      "Si l'écran revient, forcez le vidage du cache : Cmd + Maj + R sur Mac, Ctrl + F5 sur Windows.",
    ],
    canReload: true,
  },
  {
    id: "unauthorized",
    failsAt: null,
    domain: "Droits d'accès",
    // Les deux apostrophes : le registre des permissions n'emploie que la droite,
    // rien n'empêche une entrée future d'être saisie avec la typographique.
    pattern:
      /non autorisé|réservée aux administrateurs|n['’]avez pas (?:accès|la permission)|lecture seule/i,
    title: "Vous n'avez pas accès à cette page",
    cause:
      "Votre compte est bien actif, mais il lui manque la permission que cette page demande.",
    actions: [
      "Demandez à un administrateur de vous l'accorder depuis la page Équipe.",
      "Vos accès sont effectifs dès la navigation suivante, sans reconnexion.",
    ],
    canReload: false,
  },
];

const UNKNOWN: KnownError = {
  id: "unknown",
  failsAt: "app",
  domain: "Application",
  title: "Une erreur inattendue est survenue",
  cause:
    "L'application s'est arrêtée sur un cas qui n'était pas prévu. Le détail technique reste côté serveur — la référence ci-dessous permet de l'y retrouver.",
  actions: [
    "Rechargez la page : la plupart de ces erreurs ne se reproduisent pas.",
    CONTACT,
  ],
  canReload: true,
};

export function identifyError(error: unknown): KnownError {
  // Le code Prisma (`P1001`, `P2024`) vit sur l'erreur, pas dans son message.
  const code = typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? "") : "";
  const haystack = [error instanceof Error ? error.name : "", String(error), code].join(" ");

  return CATALOG.find((entry) => entry.pattern.test(haystack)) ?? UNKNOWN;
}
