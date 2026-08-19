import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { getAiConfig } from "@/lib/ai-settings";
import { AiProviderError, generateAiSuggestion } from "@/lib/ai-provider";
import { sanitizeReplyHtml } from "@/lib/sanitize-html";
import {
  MAX_RULE_DESCRIPTION_CHARS,
  parseGeneratedRule,
  ruleSystemPrompt,
} from "@/lib/ai-automation-rule";

// Brouillon de règle à partir d'une consigne en clair. La route ne crée rien :
// l'admin relit et corrige dans le formulaire avant d'enregistrer.

const bodySchema = z.object({
  description: z.string().trim().min(10).max(MAX_RULE_DESCRIPTION_CHARS),
});

// Réglage d'administration, pas un geste répété : quelques essais pour trouver
// la bonne formulation suffisent largement.
const GENERATIONS_PER_HOUR = 30;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !can(session.user.permissions, "settings.workspace")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Décrivez la règle en une phrase au moins." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`ai-automation-rule:${session.user.id}`, GENERATIONS_PER_HOUR, 3600_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de générations demandées. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const config = await getAiConfig();
  if (!config.apiKey) {
    return NextResponse.json(
      { error: "Aucune clé API IA configurée. Rendez-vous dans Paramètres > IA." },
      { status: 400 }
    );
  }

  const [statuses, priorities, categories, agents, groups] = await Promise.all([
    prisma.ticketStatus.findMany({ select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.ticketPriority.findMany({ select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.ticketCategory.findMany({ select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.agent.findMany({
      where: { isActive: true, approvalStatus: "APPROVED" },
      select: { id: true, name: true },
    }),
    prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const vocabulary = { statuses, priorities, categories, agents, groups };

  try {
    const raw = await generateAiSuggestion(config, {
      systemPrompt: ruleSystemPrompt(vocabulary),
      userPrompt: `Consigne :\n<<<\n${parsed.data.description}\n>>>`,
    });

    const draft = parseGeneratedRule(raw, vocabulary);
    return NextResponse.json({
      draft: {
        ...draft,
        // HTML d'origine inconnue : même assainissement que le contenu
        // enregistré, avant même d'atteindre l'éditeur.
        emailHtml: draft.emailHtml ? sanitizeReplyHtml(draft.emailHtml) : null,
      },
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de générer la règle." },
      { status: 500 }
    );
  }
}
