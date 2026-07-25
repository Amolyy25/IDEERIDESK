import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { getPublishedArticlesByCategory } from "@/lib/actions/knowledge-base";
import { PortalTicketForm } from "@/components/portal/portal-ticket-form";
import { PortalHeader } from "@/components/portal/portal-header";
import { PortalFooter } from "@/components/portal/portal-footer";

export const metadata: Metadata = {
  title: "Créer un ticket",
  description: "Décrivez votre demande, notre équipe support vous répond par email.",
};

export default async function NewTicketPage() {
  const [categories, customFields, config, { categories: faqCategories, uncategorized }] =
    await Promise.all([
      getTicketCategories(),
      getCustomFields(),
      getPortalSettings(),
      getPublishedArticlesByCategory(),
    ]);

  const activeCustomFields = customFields.filter((field) => field.isActive);
  // Même règle que sur l'accueil : pas de lien FAQ si elle est désactivée ou
  // vide, sinon le visiteur atterrit sur une page sans réponse.
  const hasArticles =
    faqCategories.some((c) => c.articles.length > 0) || uncategorized.length > 0;
  const faqHref = config.faqEnabled && hasArticles ? "/faq" : null;

  return (
    <>
      <PortalHeader config={config} faqHref={faqHref} containerClassName="max-w-2xl" />

      <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;accueil
        </Link>

        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {config.navCtaLabel}
          </p>
          <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
            Décrivez votre demande
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {config.introMessage ??
              "Donnez-nous le plus de détails possible. Nous vous répondons par email."}
          </p>
        </div>

        <PortalTicketForm categories={categories} customFields={activeCustomFields} />
      </main>

      <PortalFooter config={config} faqHref={faqHref} containerClassName="max-w-2xl" />
    </>
  );
}
