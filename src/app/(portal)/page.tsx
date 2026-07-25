import { getPortalSettings } from "@/lib/actions/portal-settings";
import { getPublishedArticlesByCategory } from "@/lib/actions/knowledge-base";
import { FaqBrowser } from "@/components/portal/faq-browser";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalHero } from "@/components/portal/portal-hero";
import { PortalPathCards } from "@/components/portal/portal-path-cards";
import { PortalFooter } from "@/components/portal/portal-footer";

export default async function PortalHomePage() {
  const [config, { categories, uncategorized }] = await Promise.all([
    getPortalSettings(),
    getPublishedArticlesByCategory(),
  ]);

  const groups = [
    ...categories
      .filter((c) => c.articles.length > 0)
      .map((c) => ({ id: c.id, name: c.name, articles: c.articles })),
    ...(uncategorized.length > 0
      ? [{ id: "uncategorized", name: "Autres", articles: uncategorized }]
      : []),
  ];
  const showFaq = config.faqEnabled && groups.length > 0;
  // La FAQ de l'accueil est une ancre sur la même page, pas la page /faq.
  const faqHref = showFaq ? "#faq" : null;

  return (
    <>
      <PortalHeader config={config} faqHref={faqHref} />
      <PortalHero config={config} />
      <PortalPathCards config={config} showFaq={showFaq} />

      {showFaq && (
        <section id="faq" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-3xl px-6 py-16">
            {(config.faqEyebrow || config.faqTitle) && (
              <div className="mb-8">
                {config.faqEyebrow && (
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                    {config.faqEyebrow}
                  </p>
                )}
                {config.faqTitle && (
                  <h2 className="mt-2 font-display text-3xl font-medium tracking-tight">
                    {config.faqTitle}
                  </h2>
                )}
              </div>
            )}
            <FaqBrowser
              groups={groups}
              searchEnabled={config.faqSearchEnabled}
              ctaLabel={config.navCtaLabel}
            />
          </div>
        </section>
      )}

      <PortalFooter config={config} faqHref={faqHref} />
    </>
  );
}
