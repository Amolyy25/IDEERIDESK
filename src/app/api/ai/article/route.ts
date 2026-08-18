import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getKnowledgeCategories } from "@/lib/actions/knowledge-base";
import { getTicketById } from "@/lib/actions/tickets";
import { getAiConfig } from "@/lib/ai-settings";
import { generateAiSuggestion, AiProviderError } from "@/lib/ai-provider";
import { rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { textToReplyHtml } from "@/lib/reply-html";
import { htmlToPlainText } from "@/lib/article-html";
import {
  ARTICLE_AUDIENCE_IDS,
  ARTICLE_FORMAT_IDS,
  ARTICLE_LENGTH_IDS,
  ARTICLE_TODO_MARKER,
  ARTICLE_TONE_IDS,
  MAX_ARTICLE_INSTRUCTION_CHARS,
  MAX_ARTICLE_SUBJECT_CHARS,
  findArticleAudience,
  findArticleFormat,
  findArticleLength,
  findArticleTone,
} from "@/lib/ai-article";

/**
 * Rédaction d'un article de base de connaissances à partir d'un sujet.
 *
 * Ce que cette route renvoie n'est PAS un article : c'est un brouillon qui
 * remplit un formulaire. Rien n'est écrit en base ici — l'agent relit, corrige,
 * et c'est son enregistrement qui crée l'article. La route est donc sans effet
 * de bord, et une génération ratée ne coûte qu'un clic sur « Régénérer ».
 *
 * Le catalogue des consignes (`ai-article.ts`) vit côté serveur pour la même
 * raison que celui de la réécriture : le navigateur choisit une étiquette, pas
 * ce qui est demandé au fournisseur.
 */

const bodySchema = z
  .object({
    /**
     * Le sujet, ou les notes brutes de l'agent. Facultatif quand un ticket
     * sert de source : le fil tient alors lieu de matière première, et ce
     * champ ne porte plus que les précisions à ajouter.
     */
    subject: z.string().trim().max(MAX_ARTICLE_SUBJECT_CHARS).optional(),
    /** Ticket résolu à transformer en article. */
    ticketId: z.string().min(1).optional(),
    format: z.enum(ARTICLE_FORMAT_IDS),
    audience: z.enum(ARTICLE_AUDIENCE_IDS),
    length: z.enum(ARTICLE_LENGTH_IDS),
    tone: z.enum(ARTICLE_TONE_IDS),
    /** Consigne libre, cumulative avec la trame. */
    instruction: z.string().trim().max(MAX_ARTICLE_INSTRUCTION_CHARS).optional(),
  })
  // Sans l'un des deux, il n'y a rien à rédiger — et un modèle à qui on ne
  // donne aucune matière en invente une.
  .refine((value) => Boolean(value.subject) || Boolean(value.ticketId), {
    message: "Décrivez le sujet ou partez d'un ticket.",
  });

/**
 * Bien plus bas que la suggestion ou la réécriture, et c'est voulu : une
 * génération d'article produit un document entier, elle coûte donc plusieurs
 * fois le prix d'une réponse. Trente par heure laisse largement la place à
 * l'aller-retour normal (générer, affiner, régénérer) sans qu'un doigt resté
 * sur le bouton vide le budget du mois.
 */
const ARTICLES_PER_HOUR = 30;

/**
 * Le plafond relevé, ET IL NE L'EST QUE POUR CETTE ROUTE. Un article détaillé
 * fait environ 900 mots, soit à peu près 1 500 jetons en français, auxquels
 * s'ajoutent le balisage HTML et l'en-tête. Les 1 024 jetons par défaut du
 * fournisseur le couperaient en plein milieu d'une liste d'étapes.
 */
const MAX_ARTICLE_TOKENS = 4096;

/** Bornes des champs du formulaire — voir `articleSchema` côté action. */
const MAX_TITLE_CHARS = 200;
const MAX_EXCERPT_CHARS = 300;

/**
 * Quantité de fil transmise au fournisseur quand la source est un ticket.
 * Mêmes bornes que `/api/ai/suggest`, pour la même raison : ce qui part chez un
 * sous-traitant tiers est borné par principe, pas par la taille du dossier.
 */
const MAX_MESSAGE_CHARS = 2000;
const MAX_DESCRIPTION_CHARS = 4000;

/**
 * Le balisage autorisé est plus étroit que la politique d'assainissement des
 * articles (`ARTICLE_TAGS` accepte tableaux, `div` et `style`) : il est calé sur
 * ce que l'ÉDITEUR sait rejouer.
 *
 * Un tableau ou un `<div>` dans le contenu généré fait basculer le champ en mode
 * « source HTML » (voir `needsHtmlSource`), et l'agent se retrouve à relire son
 * brouillon en code au lieu de le relire en texte. Ce qui n'est pas éditable
 * visuellement n'a rien à faire dans une génération.
 */
const HTML_RULES = `Le contenu est du HTML limité à ces balises, sans aucune autre : <p> <h2> <h3> <strong> <em> <u> <ul> <ol> <li> <a href> <blockquote> <code> <pre> <hr> <br>.
Interdits absolus : <h1> (le titre est un champ à part), <div>, <span>, <table>, <img>, <style>, l'attribut style, le Markdown et les blocs de code encadrés par des accents graves.`;

const OUTPUT_CONTRACT = `Réponds EXACTEMENT dans ce format, sans rien avant ni après :
TITRE: <le titre de l'article, une seule ligne, sans guillemets>
RESUME: <une à deux phrases décrivant l'article, une seule ligne>
CATEGORIE: <un libellé recopié exactement depuis la liste fournie, ou "aucune">
CONTENU:
<le corps de l'article en HTML>`;

/**
 * La règle qui rend une génération relisable. Un modèle à qui il manque le
 * chemin d'un menu ne dit pas qu'il lui manque : il en écrit un plausible, et
 * personne ne le repère à la relecture parce qu'il est bien tourné. Le marqueur
 * transforme cette invention silencieuse en trou visible.
 */
const NO_INVENTION_RULE = `N'invente aucun chemin de menu, nom de bouton, libellé d'écran, raccourci, délai, prix, version ou référence qui ne figure pas dans le sujet fourni.
Quand une information de ce type te manque, écris à sa place le marqueur ${ARTICLE_TODO_MARKER} ce qui manque] et poursuis. Mieux vaut dix marqueurs qu'une seule information inventée.`;

/**
 * Minimisation, ici plus exposée qu'ailleurs : le champ « sujet » est un champ
 * de saisie libre, et l'usage naturel est d'y coller ses notes — donc parfois un
 * extrait de conversation avec un client, nom et téléphone compris. Un article
 * de base de connaissances a vocation à être PUBLIÉ : une coordonnée qui y
 * entre est une coordonnée diffusée.
 *
 * La consigne ne remplace pas la relecture de l'agent, elle évite le cas le plus
 * courant — le recopiage machinal de ce qui était dans les notes.
 */
const PRIVACY_RULE = `N'écris aucune donnée personnelle dans l'article : ni nom, ni prénom, ni adresse email, ni téléphone, ni adresse postale, ni nom d'agence, ni numéro de dossier.
Si le sujet fourni en contient, généralise ("l'utilisateur", "l'agence", "le dossier concerné"). Un article est destiné à être publié.`;

const SYSTEM_PROMPT = `Tu rédiges la base de connaissances d'Ideeri, éditeur de logiciels immobiliers. Tes lecteurs sont les utilisateurs de ces logiciels et les agents du support.
Tu écris en français, dans un article prêt à être relu puis publié : pas de préambule, pas de commentaire sur ton travail, pas de proposition de variantes.

${NO_INVENTION_RULE}

${PRIVACY_RULE}

${HTML_RULES}

${OUTPUT_CONTRACT}`;

/**
 * Les modèles encadrent volontiers leur réponse dans un bloc Markdown malgré la
 * consigne — même rattrapage que dans `/api/ai/rewrite`.
 */
function stripCodeFences(value: string) {
  const fenced = /^\s*```(?:html|text)?\s*\n([\s\S]*?)\n?\s*```\s*$/i.exec(value);
  return (fenced ? fenced[1] : value).trim();
}

/** Le modèle a-t-il vraiment renvoyé du HTML, ou du texte malgré la consigne ? */
function looksLikeHtml(value: string) {
  return /<(p|ul|ol|li|h[1-6]|blockquote|pre|br|strong|em|u|a)\b/i.test(value);
}

/**
 * Découpe la réponse selon le contrat de sortie.
 *
 * Un format à marqueurs de ligne plutôt que du JSON, et c'est délibéré : le
 * corps est un document HTML de plusieurs milliers de caractères, dont
 * l'échappement dans une chaîne JSON est la première chose qu'un modèle rate
 * sur une sortie longue. Ici il n'y a rien à échapper — tout ce qui suit
 * « CONTENU: » est le contenu, guillemets et chevrons compris.
 *
 * Chaque champ manquant vaut chaîne vide : la route est tolérante, c'est
 * l'appelant qui décide de son repli.
 */
function parseGenerated(raw: string) {
  const text = stripCodeFences(raw);

  // Le retour à la ligne qui suit le marqueur est absorbé par le `trim()` du
  // corps, plus loin — inutile de le décrire ici.
  const contentMatch = /^[ \t]*CONTENU[ \t]*:[ \t]*/im.exec(text);
  // Pas de marqueur de contenu : le modèle a ignoré le contrat et écrit
  // directement l'article. Le sauver plutôt que le jeter — il est utilisable,
  // il lui manque juste son en-tête.
  if (!contentMatch) {
    return { title: "", excerpt: "", category: "", content: text };
  }

  const header = text.slice(0, contentMatch.index);
  const content = text.slice(contentMatch.index + contentMatch[0].length).trim();

  const field = (name: string) => {
    const match = new RegExp(`^[ \\t]*${name}[ \\t]*:[ \\t]*(.*)$`, "im").exec(header);
    return (match?.[1] ?? "").trim().replace(/^["«\s]+|["»\s]+$/g, "");
  };

  return {
    title: field("TITRE"),
    excerpt: field("RESUME"),
    category: field("CATEGORIE"),
    content,
  };
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Comparaison de libellés indulgente sur la casse et les accents. */
function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase().trim();
}

export async function POST(request: NextRequest) {
  const session = await auth();
  // « kb.manage » et non « kb.view » : générer un brouillon n'a de sens que pour
  // quelqu'un qui a le droit de l'enregistrer.
  if (!session?.user?.id || !can(session.user.permissions, "kb.manage")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const limit = rateLimit(`ai-article:${session.user.id}`, ARTICLES_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Trop de générations demandées. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { subject, ticketId, format, audience, length, tone, instruction } = parsed.data;

  // Lire un ticket est une permission distincte de rédiger un article : un
  // rédacteur sans accès aux tickets ne peut pas s'en servir comme source.
  if (ticketId && !can(session.user.permissions, "tickets.view")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const config = await getAiConfig();
  if (!config.apiKey) {
    return NextResponse.json(
      { error: "Aucune clé API IA configurée. Rendez-vous dans Paramètres > IA." },
      { status: 400 }
    );
  }

  // La liste des catégories vient de la base, jamais du navigateur : le modèle
  // CHOISIT dans un ensemble fermé, il ne propose pas un nom qui n'existe pas.
  const categories = await getKnowledgeCategories();

  let source: string;
  if (ticketId) {
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    }

    // Minimisation, invariant repris de `/api/ai/suggest` : les notes internes
    // ne quittent jamais l'application. Ce qui part ici est en outre destiné à
    // devenir un texte PUBLIC — d'où le rappel d'anonymisation ci-dessous, en
    // plus de celui du prompt système.
    const thread = ticket.messages
      .filter((message) => !message.isPrivate)
      .map(
        (message) =>
          `${message.authorType === "CLIENT" ? "Client" : "Agent"} : ${truncate(message.content, MAX_MESSAGE_CHARS)}`
      )
      .join("\n\n");

    source = `Source : le fil d'un ticket de support résolu. Tu dois en TIRER un article réutilisable par quelqu'un d'autre, pas le raconter.
Le problème est ce que le client décrivait ; la solution est ce que l'agent a fait ou indiqué. Ce qui n'a pas servi à résoudre (allers-retours, relances, excuses) n'a pas sa place dans l'article.
Ne mentionne ni ce ticket, ni ses intervenants, ni ses dates : l'article doit se lire sans lui, par quelqu'un qui rencontrera le même problème dans six mois.

Objet du ticket : ${truncate(ticket.subject, MAX_TITLE_CHARS)}

Demande initiale :
${truncate(ticket.description, MAX_DESCRIPTION_CHARS)}

Échanges :
${thread || "(aucun échange)"}
${subject ? `\nPrécisions de l'agent, prioritaires sur le fil :\n${subject}\n` : ""}`;
  } else {
    source = `Sujet de l'article, écrit par l'agent :
<<<
${subject}
>>>`;
  }

  const userPrompt = `${source}

Trame à suivre :
${findArticleFormat(format).instruction}

Lecteur visé : ${findArticleAudience(audience).instruction}

Longueur : ${findArticleLength(length).instruction}

Ton : ${findArticleTone(tone).instruction}
${instruction ? `\nConsigne supplémentaire de l'agent, prioritaire sur les réglages ci-dessus : ${instruction}\n` : ""}
Catégories existantes, à recopier exactement si l'une convient (sinon "aucune") :
${categories.length ? categories.map((c) => `- ${c.name}`).join("\n") : "- (aucune catégorie n'existe encore)"}

Rédige l'article.`;

  try {
    const raw = await generateAiSuggestion(config, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: MAX_ARTICLE_TOKENS,
    });

    const generated = parseGenerated(raw);
    if (!generated.content) {
      return NextResponse.json({ error: "Génération vide." }, { status: 502 });
    }

    // Le HTML d'un modèle est du HTML d'origine inconnue : il passe par
    // l'assainissement des articles, pas par la confiance. Et un modèle qui
    // aurait répondu en texte brut malgré la consigne ne doit pas atterrir en un
    // seul bloc dans l'éditeur, d'où le repli.
    const content = looksLikeHtml(generated.content)
      ? sanitizeRichHtml(generated.content)
      : textToReplyHtml(generated.content);

    if (!content.trim()) {
      return NextResponse.json({ error: "Génération vide." }, { status: 502 });
    }

    const matched = categories.find(
      (category) => normalizeLabel(category.name) === normalizeLabel(generated.category)
    );

    return NextResponse.json({
      title: generated.title.slice(0, MAX_TITLE_CHARS),
      // Un résumé absent est reconstruit depuis le corps : c'est le champ que
      // les rédacteurs laissent vide, et c'est celui qui s'affiche dans les
      // listes et les suggestions du widget.
      excerpt: (generated.excerpt || htmlToPlainText(content, MAX_EXCERPT_CHARS)).slice(
        0,
        MAX_EXCERPT_CHARS
      ),
      categoryId: matched?.id ?? null,
      categoryName: matched?.name ?? null,
      content,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Impossible de générer l'article." }, { status: 500 });
  }
}
