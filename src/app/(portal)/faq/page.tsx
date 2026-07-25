import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedArticlesByCategory } from "@/lib/actions/knowledge-base";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { FaqBrowser } from "@/components/portal/faq-browser";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalFooter } from "@/components/portal/portal-footer";

export const metadata: Metadata = {
  title: "FAQ",
};

export default async function FaqPage() {
  const [config, { categories, uncategorized }] = await Promise.all([
    getPortalSettings(),
    getPublishedArticlesByCategory(),
  ]);

  // FAQ désactivée dans les réglages : la page ne doit pas rester accessible
  // par son URL alors que plus aucun lien n'y mène.
  if (!config.faqEnabled) notFound();

  const groups = [
    ...categories
      .filter((c) => c.articles.length > 0)
      .map((c) => ({ id: c.id, name: c.name, articles: c.articles })),
    ...(uncategorized.length > 0
      ? [{ id: "uncategorized", name: "Autres", articles: uncategorized }]
      : []),
  ];

  return (
    <>
      <PortalHeader config={config} faqHref="/faq" containerClassName="max-w-3xl" />

      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-8">
          {config.faqEyebrow && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {config.faqEyebrow}
            </p>
          )}
          <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
            {config.faqTitle ?? "Foire aux questions"}
          </h1>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun article disponible pour le moment.
          </p>
        ) : (
          <FaqBrowser
            groups={groups}
            searchEnabled={config.faqSearchEnabled}
            ctaLabel={config.navCtaLabel}
          />
        )}
      </main>

      <PortalFooter config={config} faqHref="/faq" containerClassName="max-w-3xl" />
    </>
  );
}
