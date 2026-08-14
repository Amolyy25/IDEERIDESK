import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { sanitizeReplyHtml } from "@/lib/sanitize-html";
import { textToReplyHtml } from "@/lib/reply-html";
import {
  MAX_REWRITE_INPUT_CHARS,
  MAX_REWRITE_INSTRUCTION_CHARS,
  REWRITE_INTENT_IDS,
  findRewriteIntent,
} from "@/lib/ai-rewrite";

/**
 * Réécriture du message en cours de rédaction (voir `RewriteMenu` et la touche
 * Tab de la zone de réponse).
 *
 * Ce que cette route reçoit est le texte de l'agent ; ce qu'elle renvoie est le
 * même texte retravaillé, prêt à retomber dans le champ. Elle ne décide de rien
 * d'autre : l'agent relit et envoie, comme pour n'importe quel brouillon.
 */

const bodySchema = z.object({
  ticketId: z.string().min(1),
  /** Le message à reprendre : HTML d'éditeur, ou texte brut pour une note. */
  text: z.string().trim().min(1).max(MAX_REWRITE_INPUT_CHARS),
  format: z.enum(["html", "text"]),
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

const HTML_SYSTEM_RULES = `Réponds en HTML simple, limité à ces balises : <p> <br> <strong> <em> <u> <ul> <ol> <li> <a href> <blockquote> <h2> <code>.
N'utilise ni <html>, ni <body>, ni bloc de code Markdown (pas de \`\`\`), ni attribut style.`;

const TEXT_SYSTEM_RULES = `Réponds en texte brut, sans balise HTML ni Markdown.`;

function systemPrompt(format: "html" | "text") {
  return `Tu es l'assistant de rédaction d'un agent du support client d'Ideeri, éditeur de logiciels immobiliers.
On te donne un message en cours de rédaction et une consigne. Tu renvoies UNIQUEMENT le message réécrit : pas de préambule, pas de commentaire, pas de guillemets d'encadrement, pas de variantes.
Règles impératives :
- N'invente rien. Aucun chiffre, date, montant, délai, nom, référence ou lien qui ne soit déjà dans le message.
- Ne supprime aucune information utile au client.
- Garde la langue du message d'origine, sauf si la consigne demande explicitement de traduire.
- Ne rajoute ni formule d'appel ni signature si le message n'en comporte pas : elles sont ajoutées ailleurs.
- Si la consigne est impossible à appliquer, renvoie le message inchangé.
${format === "html" ? HTML_SYSTEM_RULES : TEXT_SYSTEM_RULES}`;
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

/** Le modèle a-t-il vraiment renvoyé du HTML, ou du texte malgré la consigne ? */
function looksLikeHtml(value: string) {
  return /<(p|div|ul|ol|li|h[1-6]|blockquote|pre|br|strong|em|u|a)\b/i.test(value);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !can(session.user.permissions, "tickets.respond")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const limit = rateLimit(`ai-rewrite:${session.user.id}`, REWRITES_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de réécritures demandées. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { ticketId, text, format, intent, instruction } = parsed.data;

  // La consigne d'une intention prédéfinie est reprise du catalogue, jamais du
  // corps de la requête : le navigateur ne choisit que l'étiquette, pas ce qui
  // est demandé au fournisseur.
  const chosen = findRewriteIntent(intent);
  const finalInstruction = chosen.id === "custom" ? (instruction ?? "") : chosen.instruction;
  if (!finalInstruction) {
    return NextResponse.json({ error: "Consigne manquante." }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
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
  let context = "";
  if (format === "html") {
    const lastFromClient = [...ticket.messages]
      .reverse()
      .find((message) => !message.isPrivate && message.authorType === "CLIENT");
    context = `Contexte, à titre indicatif seulement (ne pas recopier) :
Sujet du ticket : ${ticket.subject.slice(0, MAX_SUBJECT_CHARS)}
Dernier message du client : ${(lastFromClient?.content ?? ticket.description).slice(0, MAX_CONTEXT_CHARS)}

`;
  }

  const userPrompt = `Consigne : ${finalInstruction}

${context}Message à réécrire :
<<<
${text}
>>>`;

  try {
    const raw = await generateAiSuggestion(config, {
      systemPrompt: systemPrompt(format),
      userPrompt,
    });
    const cleaned = stripCodeFences(raw);
    if (!cleaned) {
      return NextResponse.json({ error: "Réécriture vide." }, { status: 502 });
    }

    // Le HTML d'un modèle est du HTML d'origine inconnue : il passe par le même
    // assainissement que celui d'un message enregistré, et non par la confiance.
    // Un modèle qui aurait ignoré la consigne et répondu en texte brut ne doit
    // pas pour autant atterrir en un seul bloc dans l'éditeur, d'où le repli.
    const result =
      format === "html"
        ? looksLikeHtml(cleaned)
          ? sanitizeReplyHtml(cleaned)
          : textToReplyHtml(cleaned)
        : cleaned;

    return NextResponse.json({ result, intent: chosen.id });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Impossible de réécrire le message." }, { status: 500 });
  }
}
