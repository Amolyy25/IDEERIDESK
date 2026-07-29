/**
 * Mentions « @Prénom Nom » dans les notes internes des tickets.
 *
 * Le texte de la note reste la seule source de vérité : rien n'est stocké à
 * côté (pas de tableau d'identifiants transmis par le client, qu'il faudrait
 * revalider et qui pourrait mentir sur qui a été cité). Le serveur relit donc
 * la note et la confronte à la liste des agents, exactement comme le fil de
 * discussion le fait pour surligner les mentions à l'affichage.
 */

export type MentionableAgent = {
  id: string;
  name: string;
  email: string;
};

/** Casse et accents ignorés : « @jean dupont » cite bien Jean Dupont. */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export type MentionMatch<T extends MentionableAgent = MentionableAgent> = {
  /** Index du « @ » dans le texte d'origine. */
  start: number;
  /** Index de fin (exclu) du nom mentionné. */
  end: number;
  agent: T;
};

/**
 * Repère les mentions d'agents dans un texte, dans l'ordre d'apparition.
 *
 * Les noms les plus longs sont testés d'abord : avec un « Jean » et un « Jean
 * Dupont » dans l'équipe, « @Jean Dupont » ne doit pas se réduire à « Jean ».
 */
export function scanMentions<T extends MentionableAgent>(
  content: string,
  agents: T[]
): MentionMatch<T>[] {
  const candidates = agents
    .map((agent) => ({ agent, name: agent.name.trim() }))
    .filter((candidate) => candidate.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const matches: MentionMatch<T>[] = [];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "@") continue;
    // Un « @ » collé à un mot est une adresse email (jean@ideeri.fr), pas un ping.
    if (index > 0 && WORD_CHARACTER.test(content[index - 1])) continue;

    const found = candidates.find(({ name }) => {
      const slice = content.slice(index + 1, index + 1 + name.length);
      if (normalize(slice) !== normalize(name)) return false;
      // Le nom doit s'arrêter sur une frontière de mot, sinon « @Jeanne »
      // citerait Jean.
      const next = content[index + 1 + name.length] ?? "";
      return next === "" || !WORD_CHARACTER.test(next);
    });

    if (!found) continue;

    const end = index + 1 + found.name.length;
    matches.push({ start: index, end, agent: found.agent });
    index = end - 1;
  }

  return matches;
}

/** Agents cités dans le texte, dédoublonnés. */
export function findMentionedAgents<T extends MentionableAgent>(
  content: string,
  agents: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const match of scanMentions(content, agents)) {
    byId.set(match.agent.id, match.agent);
  }
  return [...byId.values()];
}

export type MentionSegment = {
  text: string;
  /** Renseigné quand le segment est une mention. */
  agentId?: string;
};

/** Découpe le texte en segments pour le surlignage à l'affichage. */
export function splitMentionSegments(
  content: string,
  agents: MentionableAgent[]
): MentionSegment[] {
  const matches = scanMentions(content, agents);
  if (matches.length === 0) return [{ text: content }];

  const segments: MentionSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: content.slice(cursor, match.start) });
    }
    segments.push({ text: content.slice(match.start, match.end), agentId: match.agent.id });
    cursor = match.end;
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor) });
  }

  return segments;
}

/**
 * Isole le « @… » en cours de frappe juste avant le curseur, pour alimenter
 * l'autocomplétion. Renvoie `null` dès que le fragment ne peut plus être une
 * mention (pas de « @ » ouvert, ou fragment trop long pour un nom).
 */
export function readMentionDraft(value: string, caretIndex: number) {
  const before = value.slice(0, caretIndex);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  // Adresse email en cours de frappe : pas une mention.
  if (at > 0 && WORD_CHARACTER.test(before[at - 1])) return null;

  const query = before.slice(at + 1);
  // Un nom tient sur une ligne et reste court ; au-delà, l'agent écrit sa note,
  // il ne cherche plus un collègue.
  if (query.length > 40 || /[\n\r]/.test(query)) return null;

  return { start: at, query };
}

/** Agents proposés pour un fragment saisi après « @ » (nom ou email). */
export function matchMentionCandidates<T extends MentionableAgent>(
  agents: T[],
  query: string
): T[] {
  const needle = normalize(query.trim());
  if (needle.length === 0) return agents;
  return agents.filter(
    (agent) =>
      normalize(agent.name).includes(needle) || normalize(agent.email).includes(needle)
  );
}
