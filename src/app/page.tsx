import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getPortalSettings } from "@/lib/actions/portal-settings";
import { PortalTicketForm } from "@/components/portal/portal-ticket-form";

export const metadata: Metadata = {
  title: "Support — Ideeri",
  description: "Contactez le support Ideeri ou consultez la FAQ.",
};

// Dépend de données modifiables en admin (produits, champs personnalisés,
// message d'accueil) — sans ça, Next préconstruit "/" en statique et un
// changement de config n'apparaît qu'au prochain déploiement.
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const [categories, customFields, portalSettings] = await Promise.all([
    getTicketCategories(),
    getCustomFields(),
    getPortalSettings(),
  ]);

  const activeCustomFields = customFields.filter((field) => field.isActive);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
          <Image
            src="/logoIdeeri.jpeg"
            alt="Ideeri"
            width={100}
            height={26}
            className="h-6 w-auto"
            priority
          />
          <div className="flex items-center gap-4 text-sm">
            {portalSettings.faqEnabled && (
              <Link href="/faq" className="text-muted-foreground hover:text-foreground">
                FAQ
              </Link>
            )}
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Comment pouvons-nous vous aider ?</h1>
          {portalSettings.introMessage && (
            <p className="mt-2 text-sm text-muted-foreground">{portalSettings.introMessage}</p>
          )}
        </div>

        <PortalTicketForm categories={categories} customFields={activeCustomFields} />
      </main>
    </div>
  );
}
