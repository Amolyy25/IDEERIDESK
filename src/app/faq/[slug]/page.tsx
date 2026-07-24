import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublishedArticleBySlug } from "@/lib/actions/knowledge-base";
import { ArticleContent } from "@/components/knowledge-base/article-content";

export default async function FaqArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logoIdeeri.jpeg" alt="Ideeri" width={100} height={26} className="h-6 w-auto" />
            <span className="text-sm font-medium text-muted-foreground">Support</span>
          </Link>
          <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground">
            ← FAQ
          </Link>
        </div>
      </header>

      <main className="px-6 py-10">
        <ArticleContent title={article.title} html={article.content} />
      </main>
    </div>
  );
}
