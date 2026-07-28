import { NextRequest, NextResponse } from "next/server";
import { searchPublishedArticles } from "@/lib/actions/knowledge-base";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { htmlToPlainText } from "@/lib/article-html";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

const PREVIEW_LENGTH = 180;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json({ articles: [] });
  }

  const [articles, portal] = await Promise.all([
    searchPublishedArticles(query, 4),
    getPortalSettings(),
  ]);

  return NextResponse.json({
    articles: articles.map((article) => ({
      id: article.id,
      title: article.title,
      // Aperçu d'une ou deux lignes, calculé côté serveur : le contenu est du
      // HTML riche, l'afficher tel quel montrait les balises au visiteur.
      preview: article.excerpt || htmlToPlainText(article.content, PREVIEW_LENGTH),
      // La page publique de l'article n'existe que si la FAQ du portail est
      // activée. Sinon on renvoie le contenu, affiché formaté sur place.
      url: portal.faqEnabled ? `/faq/${article.slug}` : null,
      // Assaini avant de sortir : ce HTML est injecté par le widget dans une
      // iframe hébergée chez le client, sans repasser par le rendu serveur.
      html: portal.faqEnabled ? null : sanitizeRichHtml(article.content),
    })),
  });
}
