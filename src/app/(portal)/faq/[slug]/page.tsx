import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedArticleBySlug } from "@/lib/actions/knowledge-base";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { ArticleContent } from "@/components/knowledge-base/article-content";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalFooter } from "@/components/portal/portal-footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return {};
  return { title: article.title, description: article.excerpt ?? undefined };
}

export default async function FaqArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [article, config] = await Promise.all([
    getPublishedArticleBySlug(slug),
    getPortalSettings(),
  ]);

  if (!article || !config.faqEnabled) {
    notFound();
  }

  return (
    <>
      <PortalHeader config={config} faqHref="/faq" containerClassName="max-w-3xl" />

      <main className="px-6 py-10">
        <ArticleContent title={article.title} html={article.content} />
      </main>

      <PortalFooter config={config} faqHref="/faq" containerClassName="max-w-3xl" />
    </>
  );
}
