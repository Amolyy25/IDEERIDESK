import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { searchPublishedArticles } from "@/lib/actions/knowledge-base";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";

const bodySchema = z.object({ ticketId: z.string().min(1) });

// Quantité de texte transmise au fournisseur d'IA, bornée volontairement.
const MAX_MESSAGE_CHARS = 2000;
const MAX_DESCRIPTION_CHARS = 4000;
const MAX_ARTICLE_CHARS = 4000;

// Suggestions plafonnées par agent : chaque appel est facturé au jeton chez le
// fournisseur, une boucle côté client viderait le budget sans limite.
const SUGGESTIONS_PER_HOUR = 60;

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

const SYSTEM_PROMPT = `Tu es l'assistant d'un agent du support client d'Ideeri, éditeur de logiciels immobiliers.
Rédige un brouillon de réponse professionnelle, concise et en français, destinée directement au client.
Appuie-toi sur les articles de la base de connaissances fournis lorsqu'ils sont pertinents, sans les citer comme sources.
Ne réponds qu'avec le texte du message, sans préambule ni formule du type "Voici une proposition".`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !can(session.user.permissions, "tickets.respond")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const limit = rateLimit(`ai-suggest:${session.user.id}`, SUGGESTIONS_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de suggestions demandées. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const ticket = await getTicketById(parsed.data.ticketId);
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

  const articles = await searchPublishedArticles(`${ticket.subject} ${ticket.description}`);

  // Minimisation avant transmission à un sous-traitant tiers : les notes
  // internes (`isPrivate`) ne quittent jamais l'application, et chaque message
  // est tronqué. Le fil contient les coordonnées et la situation de personnes
  // physiques — n'en sortir que ce qui sert à rédiger la réponse.
  const threadText = ticket.messages
    .filter((m) => !m.isPrivate)
    .map(
      (m) =>
        `${m.authorType === "CLIENT" ? "Client" : "Agent"}: ${truncate(m.content, MAX_MESSAGE_CHARS)}`
    )
    .join("\n\n");

  const kbText = articles.length
    ? articles
        .map((a) => `Article « ${a.title} » : ${truncate(a.content, MAX_ARTICLE_CHARS)}`)
        .join("\n\n")
    : "Aucun article pertinent trouvé.";

  const userPrompt = `Sujet du ticket : ${ticket.subject}

Description initiale du client :
${truncate(ticket.description, MAX_DESCRIPTION_CHARS)}

Fil de discussion :
${threadText || "(aucun message pour le moment)"}

Articles de la base de connaissances potentiellement pertinents :
${kbText}

Rédige la prochaine réponse à envoyer au client.`;

  try {
    const suggestion = await generateAiSuggestion(config, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    });
    return NextResponse.json({
      suggestion: suggestion.trim(),
      sources: articles.map((a) => ({ id: a.id, title: a.title })),
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Impossible de générer une suggestion." }, { status: 500 });
  }
}
