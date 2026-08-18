import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { sanitizeReplyHtml, sanitizeRichHtml } from "@/lib/sanitize-html";
import { textToReplyHtml } from "@/lib/reply-html";
import {
  MAX_REWRITE_INPUT_CHARS,
  MAX_REWRITE_INSTRUCTION_CHARS,
  REWRITE_INTENT_IDS,
  findRewriteIntent,
} from "@/lib/ai-rewrite";

/**
 * Réécriture d'un texte en cours de rédaction.
 *
 * Ce que cette route reçoit est le texte de l'agent ; ce qu'elle renvoie est le
 * même texte retravaillé, prêt à retomber dans le champ. Elle ne décide de rien
 * d'autre : l'agent relit, comme pour n'importe quel brouillon.
 *
 * DEUX APPELANTS, distingués par la seule présence de `ticketId` :
 *
 * - la zone de réponse d'un ticket (`RewriteMenu`, touche Tab) — le texte est
 *   un message, il part au client, et il est assaini au profil « réponse » ;
 * - une SÉLECTION dans l'éditeur d'un article de base de connaissances — pas de
 *   ticket, pas de contexte de fil, et l'assainissement suit le profil
 *   « article », plus large, celui sous lequel le contenu est déjà stocké.
 *
 * Chacun a sa permission, et c'est la présence du ticket qui tranche : il n'y a
 * pas d'appel « neutre » que les deux pourraient emprunter.
 */

const bodySchema = z.object({
  /** Absent = réécriture d'une sélection d'article. */
  ticketId: z.string().min(1).optional(),
  /** Le texte à reprendre : HTML d'éditeur, ou texte brut pour une note. */
  text: z.string().trim().min(1).max(MAX_REWRITE_INPUT_CHARS),
  /**
   * `inline` : une sélection prise à l'intérieur d'un paragraphe. Le résultat
   * remplace la sélection à sa place exacte, il ne doit donc contenir aucune
   * balise de bloc — un `<p>` renvoyé ici couperait le paragraphe en deux.
   */
  format: z.enum(["html", "text", "inline"]),
  intent: z.enum(REWRITE_INTENT_IDS),
  /** Seulement pour l'intention « custom » : la consigne écrite par l'agent. */
  instruction: z.string().trim().max(MAX_REWRITE_INSTRUCTION_CHARS).optional(),
});

// Le contexte transmis avec une réponse publique, borné comme dans
// `/api/ai/suggest`.
const MAX_SUBJECT_CHARS = 300;
const MAX_CONTEXT_CHARS = 1500;

/**
 * Plus haut que la suggestion : la réécriture est un geste de rédaction, on la
 * demande plusieurs fois sur un même message (corriger, puis raccourcir). Assez
 * bas, malgré tout, pour qu'une touche Tab restée enfoncée ne vide pas le budget
 * du mois chez le fournisseur.
 */
const REWRITES_PER_HOUR = 120;

type RewriteFormat = z.infer<typeof bodySchema>["format"];

const HTML_SYSTEM_RULES = `Réponds en HTML simple, limité à ces balises : <p> <br> <strong> <em> <u> <ul> <ol> <li> <a href> <blockquote> <h2> <h3> <code>.
N'utilise ni <html>, ni <body>, ni bloc de code Markdown (pas de \`\`\`), ni attribut style.`;

const TEXT_SYSTEM_RULES = `Réponds en texte brut, sans balise HTML ni Markdown.`;

const INLINE_SYSTEM_RULES = `Le texte donné est un EXTRAIT pris à l'intérieur d'un paragraphe : il peut commencer ou finir en plein milieu d'une phrase, et c'est normal.
Réponds sans aucune balise de bloc — ni <p>, ni <div>, ni titre, ni liste, ni <br>. Seules <strong> <em> <u> <a href> <code> sont autorisées.
Ne rétablis ni majuscule initiale ni point final s'ils n'y étaient pas : ton texte se recolle exactement à la place de l'extrait.`;

function formatRules(format: RewriteFormat) {
  if (format === "text") return TEXT_SYSTEM_RULES;
  if (format === "inline") return INLINE_SYSTEM_RULES;
  return HTML_SYSTEM_RULES;
}

function systemPrompt(format: RewriteFormat, isArticle: boolean) {
  // Le cadre change avec l'appelant : un message part à une personne et se
  // termine par une formule, un extrait d'article n'a ni destinataire ni fin.
  // Sans cette distinction, « améliore » ajoutait des formules de politesse au
  // milieu d'une procédure.
  const frame = isArticle
    ? `Tu es l'assistant de rédaction de la base de connaissances d'Ideeri, éditeur de logiciels immobiliers.
On te donne un extrait d'article et une consigne. Tu renvoies UNIQUEMENT l'extrait réécrit : pas de préambule, pas de commentaire, pas de guillemets d'encadrement, pas de variantes.`
    : `Tu es l'assistant de rédaction d'un agent du support client d'Ideeri, éditeur de logiciels immobiliers.
On te donne un message en cours de rédaction et une consigne. Tu renvoies UNIQUEMENT le message réécrit : pas de préambule, pas de commentaire, pas de guillemets d'encadrement, pas de variantes.`;

  const audienceRules = isArticle
    ? `- Ne supprime aucune information utile au lecteur.
- N'ajoute ni titre, ni introduction, ni conclusion : l'extrait s'insère dans un article qui en a déjà.`
    : `- Ne supprime aucune information utile au client.
- Ne rajoute ni formule d'appel ni signature si le message n'en comporte pas : elles sont ajoutées ailleurs.`;

  return `${frame}
Règles impératives :
- N'invente rien. Aucun chiffre, date, montant, délai, nom, référence ou lien qui ne soit déjà dans le texte.
${audienceRules}
- Garde la langue du texte d'origine, sauf si la consigne demande explicitement de traduire.
- Si la consigne est impossible à appliquer, renvoie le texte inchangé.
${formatRules(format)}`;
}

/**
 * Les modèles encadrent volontiers leur réponse dans un bloc Markdown, malgré la
 * consigne. Le retirer ici plutôt que de le laisser arriver dans l'éditeur, où
 * il se lirait comme trois accents graves envoyés au client.
 */
function stripCodeFences(value: string) {
  const fenced = /^\s*```(?:html|text)?\s*\n([\s\S]*?)\n?\s*```\s*$/i.exec(value);
  return (fenced ? fenced[1] : value).trim();
}

/**
 * Le filet de la réécriture en ligne : malgré la consigne, un modèle enveloppe
 * volontiers sa réponse dans un `<p>`. Réinséré tel quel au milieu d'une phrase,
 * ce paragraphe couperait celui de l'agent en deux — un dégât visible et pénible
 * à défaire. On ne retire l'enveloppe que si elle est unique : deux paragraphes
 * signifient que le modèle a vraiment voulu deux blocs, et c'est alors à
 * l'éditeur de trancher, pas à cette expression rationnelle.
 */
function unwrapSingleParagraph(html: string) {
  const match = /^<p>([\s\S]*)<\/p>$/i.exec(html.trim());
  if (!match || /<p[\s>]/i.test(match[1])) return html;
  return match[1];
}

/** Le modèle a-t-il vraiment renvoyé du HTML, ou du texte malgré la consigne ? */
function looksLikeHtml(value: string) {
  return /<(p|div|ul|ol|li|h[1-6]|blockquote|pre|br|strong|em|u|a)\b/i.test(value);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { ticketId, text, format, intent, instruction } = parsed.data;

  // La permission suit l'appelant, pas la route : reprendre un message de
  // ticket relève de « répondre », reprendre un extrait d'article relève de
  // « rédiger ». Le corps de la requête ne peut pas élargir ce qu'il obtient —
  // il choisit seulement laquelle des deux gardes lui est opposée.
  const isArticle = !ticketId;
  const permission = isArticle ? "kb.manage" : "tickets.respond";
  if (!can(session.user.permissions, permission)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const limit = rateLimit(`ai-rewrite:${session.user.id}`, REWRITES_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de réécritures demandées. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  // La consigne d'une intention prédéfinie est reprise du catalogue, jamais du
  // corps de la requête : le navigateur ne choisit que l'étiquette, pas ce qui
  // est demandé au fournisseur.
  const chosen = findRewriteIntent(intent);
  const finalInstruction = chosen.id === "custom" ? (instruction ?? "") : chosen.instruction;
  if (!finalInstruction) {
    return NextResponse.json({ error: "Consigne manquante." }, { status: 400 });
  }

  const ticket = ticketId ? await getTicketById(ticketId) : null;
  if (ticketId && !ticket) {
    return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
  }

  const config = await getAiConfig();
  if (!config.apiKey) {
    return NextResponse.json(
      { error: "Aucune clé API IA configurée. Rendez-vous dans Paramètres > IA." },
      { status: 400 }
    );
  }

  // Minimisation avant transmission à un sous-traitant tiers, comme pour la
  // suggestion — en plus strict ici, parce que la réécriture n'a pas besoin du
  // dossier : le message de l'agent se suffit à lui-même.
  //
  // Une NOTE INTERNE part donc seule, sans une ligne du fil : c'est l'invariant
  // posé par `/api/ai/suggest` (ce qui est marqué privé ne sort pas de
  // l'application), et il tient ici aussi. Seule une réponse destinée au client
  // reçoit un rappel du sujet et de la dernière demande, sans quoi « développe »
  // ou « réponds plus précisément » n'aurait rien sur quoi s'appuyer.
  // Aucun contexte pour un extrait d'article : il n'y a pas de dossier derrière,
  // et l'extrait se suffit à lui-même.
  let context = "";
  if (ticket && format === "html") {
    const lastFromClient = [...ticket.messages]
      .reverse()
      .find((message) => !message.isPrivate && message.authorType === "CLIENT");
    context = `Contexte, à titre indicatif seulement (ne pas recopier) :
Sujet du ticket : ${ticket.subject.slice(0, MAX_SUBJECT_CHARS)}
Dernier message du client : ${(lastFromClient?.content ?? ticket.description).slice(0, MAX_CONTEXT_CHARS)}

`;
  }

  const userPrompt = `Consigne : ${finalInstruction}

${context}${isArticle ? "Extrait à réécrire" : "Message à réécrire"} :
<<<
${text}
>>>`;

  try {
    const raw = await generateAiSuggestion(config, {
      systemPrompt: systemPrompt(format, isArticle),
      userPrompt,
    });
    const cleaned = stripCodeFences(raw);
    if (!cleaned) {
      return NextResponse.json({ error: "Réécriture vide." }, { status: 502 });
    }

    // Le HTML d'un modèle est du HTML d'origine inconnue : il passe par le même
    // assainissement que le contenu enregistré, et non par la confiance. Le
    // profil suit la destination — « réponse » pour un message de ticket,
    // « article » pour un extrait de base de connaissances, qui est déjà stocké
    // sous ce profil-là.
    //
    // Un modèle qui aurait ignoré la consigne et répondu en texte brut ne doit
    // pas pour autant atterrir en un seul bloc dans l'éditeur, d'où le repli.
    let result: string;
    if (format === "text") {
      result = cleaned;
    } else {
      const html = looksLikeHtml(cleaned) ? cleaned : textToReplyHtml(cleaned);
      const sanitized = isArticle ? sanitizeRichHtml(html) : sanitizeReplyHtml(html);
      result = format === "inline" ? unwrapSingleParagraph(sanitized) : sanitized;
    }

    return NextResponse.json({ result, intent: chosen.id });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Impossible de réécrire le message." }, { status: 500 });
  }
}
