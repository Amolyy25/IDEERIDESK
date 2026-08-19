// Consigne en clair (« les urgents sans réponse depuis 4 h passent en retard »)
// → paramètres de règle. Le modèle renvoie des NOMS, jamais des identifiants :
// un id inventé pointerait vers un statut au hasard, un nom inconnu se voit.

import { MAX_DELAY_MINUTES, MIN_DELAY_MINUTES } from "@/lib/automation-delay";

export const MAX_RULE_DESCRIPTION_CHARS = 600;

// Aligné sur la borne du schéma d'enregistrement (`ruleSchema.emailHtml`).
const MAX_EMAIL_CHARS = 20000;

type NamedRow = { id: string; name: string };

export type RuleVocabulary = {
  statuses: NamedRow[];
  priorities: NamedRow[];
  categories: NamedRow[];
  agents: NamedRow[];
  groups: NamedRow[];
};

export type GeneratedRuleDraft = {
  name: string;
  triggerStatusId: string | null;
  triggerPriorityIds: string[];
  triggerCategoryIds: string[];
  delayMinutes: number | null;
  onlyUnanswered: boolean;
  onlyUnassigned: boolean;
  onlyBreachedSla: boolean;
  actionStatusId: string | null;
  actionPriorityId: string | null;
  actionAssigneeId: string | null;
  actionNotifyGroupId: string | null;
  addNote: boolean;
  noteContent: string;
  sendEmail: boolean;
  emailHtml: string | null;
  /** Ce que le modèle a nommé sans qu'on retrouve la valeur : affiché à l'admin. */
  unresolved: string[];
};

// La liste des agents n'est PAS transmise au fournisseur : un nom d'agent est une
// donnée personnelle. Le modèle recopie le prénom écrit par l'admin, on résout ici.
export function ruleSystemPrompt(vocabulary: RuleVocabulary) {
  const names = (rows: NamedRow[]) =>
    rows.length > 0 ? rows.map((row) => `« ${row.name} »`).join(", ") : "aucun";

  return `Tu configures une règle automatique dans l'outil de support d'Ideeri, éditeur de logiciels immobiliers.
Une règle surveille les tickets d'un statut donné et agit seule quand ils restent trop longtemps sans bouger.

Statuts disponibles : ${names(vocabulary.statuses)}.
Priorités disponibles : ${names(vocabulary.priorities)}.
Produits disponibles : ${names(vocabulary.categories)}.
Groupes d'agents : ${names(vocabulary.groups)}.

Réponds UNIQUEMENT par un objet JSON, sans commentaire ni bloc de code, avec ces clés :
- "name" : nom court de la règle (5 mots maximum), en français.
- "triggerStatus" : nom exact du statut surveillé, repris de la liste ci-dessus.
- "priorities" : tableau de noms de priorités concernées. Tableau vide = toutes.
- "categories" : tableau de noms de produits concernés. Tableau vide = tous.
- "delayMinutes" : délai d'inactivité en MINUTES (4 h = 240, 3 jours = 4320).
- "onlyUnanswered" : true si la consigne parle d'absence de RÉPONSE au client, false si elle parle d'inactivité en général.
- "onlyUnassigned" : true seulement si la consigne exige que le ticket n'ait pas d'agent assigné.
- "onlyBreachedSla" : true seulement si la consigne parle de délai SLA dépassé.
- "actionStatus" : nom exact du statut d'arrivée. Il doit DIFFÉRER de "triggerStatus".
- "actionPriority" : nom d'une priorité à poser, ou null pour ne pas y toucher.
- "assigneeName" : prénom ou nom de l'agent à qui assigner, tel qu'écrit dans la consigne, ou null.
- "notifyGroup" : nom exact du groupe à prévenir, repris de la liste ci-dessus, ou null. Un ticket confié à une ÉQUIPE se traduit par ce champ, pas par "assigneeName" — il reste alors non assigné. Les deux ne peuvent pas être renseignés en même temps.
- "addNote" : true s'il faut laisser une note interne.
- "noteContent" : texte de la note, en français, une phrase.
- "sendEmail" : true seulement si la consigne demande explicitement d'écrire au client.
- "emailHtml" : message au client en HTML simple (<p>, <strong>, <em>, <ul>, <li>, <a href>), ou null si "sendEmail" est false.

Règles impératives :
- N'invente aucun statut, priorité ni produit hors des listes fournies.
- Si la consigne ne précise pas un point, choisis la valeur la plus prudente : pas d'email, pas de réassignation, pas de changement de priorité.
- N'invente ni délai contractuel, ni montant, ni engagement dans le message au client.`;
}

/** Rapprochement tolérant : casse et accents ignorés, puis inclusion. */
function findByName<T extends NamedRow>(rows: T[], value: unknown): T | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const wanted = normalize(value);
  return (
    rows.find((row) => normalize(row.name) === wanted) ??
    rows.find((row) => normalize(row.name).includes(wanted) || wanted.includes(normalize(row.name)))
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function asBoolean(value: unknown) {
  return value === true;
}

/** Chaîne non vide bornée, ou null : un modèle renvoie volontiers `null` ou un nombre. */
function asText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, maxLength);
}

function acceptableDelay(minutes: number) {
  if (!Number.isFinite(minutes)) return null;
  if (minutes < MIN_DELAY_MINUTES || minutes > MAX_DELAY_MINUTES) return null;
  return Math.round(minutes);
}

function asNameList(rows: NamedRow[], value: unknown, unresolved: string[]) {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    const found = findByName(rows, entry);
    if (found) ids.push(found.id);
    else if (typeof entry === "string" && entry.trim()) unresolved.push(entry.trim());
  }
  return [...new Set(ids)];
}

export function parseGeneratedRule(raw: string, vocabulary: RuleVocabulary): GeneratedRuleDraft {
  const json = extractJsonObject(raw);
  const unresolved: string[] = [];

  const triggerStatus = findByName(vocabulary.statuses, json.triggerStatus);
  const actionStatus = findByName(vocabulary.statuses, json.actionStatus);
  const actionPriority = findByName(vocabulary.priorities, json.actionPriority);
  const assignee = findByName(vocabulary.agents, json.assigneeName);
  const notifyGroup = findByName(vocabulary.groups, json.notifyGroup);

  if (!triggerStatus && typeof json.triggerStatus === "string") unresolved.push(json.triggerStatus);
  if (!actionStatus && typeof json.actionStatus === "string") unresolved.push(json.actionStatus);
  if (!assignee && typeof json.assigneeName === "string" && json.assigneeName.trim()) {
    unresolved.push(json.assigneeName);
  }
  if (!notifyGroup && typeof json.notifyGroup === "string" && json.notifyGroup.trim()) {
    unresolved.push(json.notifyGroup);
  }

  const delay = Number(json.delayMinutes);
  const sendEmail = asBoolean(json.sendEmail);

  // Exclusifs : l'agent l'emporte si le modèle a rempli les deux malgré la
  // consigne, un ticket ne pouvant pas être à la fois confié et diffusé.
  let actionAssigneeId: string | null = null;
  let actionNotifyGroupId: string | null = null;
  if (assignee) {
    actionAssigneeId = assignee.id;
  } else if (notifyGroup) {
    actionNotifyGroupId = notifyGroup.id;
  }

  return {
    name: asText(json.name, 120) ?? "",
    triggerStatusId: triggerStatus?.id ?? null,
    triggerPriorityIds: asNameList(vocabulary.priorities, json.priorities, unresolved),
    triggerCategoryIds: asNameList(vocabulary.categories, json.categories, unresolved),
    delayMinutes: acceptableDelay(delay),
    onlyUnanswered: asBoolean(json.onlyUnanswered),
    onlyUnassigned: asBoolean(json.onlyUnassigned),
    onlyBreachedSla: asBoolean(json.onlyBreachedSla),
    // Un statut d'arrivée identique au déclencheur rejouerait la règle sans fin :
    // mieux vaut le laisser vide et faire choisir l'admin.
    actionStatusId: actionStatus && actionStatus.id !== triggerStatus?.id ? actionStatus.id : null,
    actionPriorityId: actionPriority?.id ?? null,
    actionAssigneeId,
    actionNotifyGroupId,
    addNote: asBoolean(json.addNote),
    noteContent: asText(json.noteContent, 2000) ?? "",
    sendEmail,
    emailHtml: sendEmail ? asText(json.emailHtml, MAX_EMAIL_CHARS) : null,
    unresolved: [...new Set(unresolved)],
  };
}

/** Les modèles encadrent volontiers leur JSON de texte ou d'un bloc Markdown. */
function extractJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Réponse illisible de l'IA.");
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object") throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Réponse illisible de l'IA.");
  }
}
