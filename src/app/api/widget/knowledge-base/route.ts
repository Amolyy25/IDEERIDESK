import { NextRequest, NextResponse } from "next/server";
import { searchPublishedArticles } from "@/lib/actions/knowledge-base";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json({ articles: [] });
  }

  const articles = await searchPublishedArticles(query, 4);
  return NextResponse.json({
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      content: a.content,
    })),
  });
}
