import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getTicketById } from "@/lib/actions/tickets";
import { searchPublishedArticles } from "@/lib/actions/knowledge-base";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";

const bodySchema = z.object({ ticketId: z.string().min(1) });

const SYSTEM_PROMPT = `Tu es l'assistant d'un agent du support client d'Ideeri, éditeur de logiciels immobiliers.
Rédige un brouillon de réponse professionnelle, concise et en français, destinée directement au client.
Appuie-toi sur les articles de la base de connaissances fournis lorsqu'ils sont pertinents, sans les citer comme sources.
Ne réponds qu'avec le texte du message, sans préambule ni formule du type "Voici une proposition".`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.canRespond) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
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

  const threadText = ticket.messages
    .map((m) => `${m.authorType === "CLIENT" ? "Client" : "Agent"}: ${m.content}`)
    .join("\n\n");

  const kbText = articles.length
    ? articles.map((a) => `Article « ${a.title} » : ${a.content}`).join("\n\n")
    : "Aucun article pertinent trouvé.";

  const userPrompt = `Sujet du ticket : ${ticket.subject}

Description initiale du client :
${ticket.description}

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
