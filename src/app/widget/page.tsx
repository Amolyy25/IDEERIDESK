import type { Metadata } from "next";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getGlobalSettings } from "@/lib/actions/settings";
import { getSourceForm } from "@/lib/actions/sources";
import { WidgetForm } from "@/components/widget/widget-form";
import { SOURCE_FORM_DEFAULTS } from "@/lib/sources";
import { parseContextFromSearchParams, type RawSearchParams } from "@/lib/papairis-context";

// Source utilisée quand l'intégration n'en précise aucune : conserve le
// comportement des widgets déjà déployés avant la gestion des sources.
const DEFAULT_SOURCE_SLUG = "widget-papairis";

function readSourceSlug(params: RawSearchParams) {
  const value = params["source"];
  const slug = Array.isArray(value) ? value[0] : value;
  return slug?.trim() || DEFAULT_SOURCE_SLUG;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const form = await getSourceForm(readSourceSlug(await searchParams));
  return { title: `${form?.formTitle ?? SOURCE_FORM_DEFAULTS.formTitle} — Ideeri` };
}

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  const [categories, customFields, settings, form] = await Promise.all([
    getTicketCategories(),
    getCustomFields(),
    getGlobalSettings(),
    getSourceForm(readSourceSlug(resolvedSearchParams)),
  ]);

  // Source inconnue ou désactivée : le formulaire reste utilisable avec les
  // réglages par défaut, sans rattachement à une source.
  const config = form ?? { ...SOURCE_FORM_DEFAULTS, slug: null, useGlobalCustomFields: true };
  const activeCustomFields = config.useGlobalCustomFields
    ? customFields.filter((field) => field.isActive)
    : [];
  const initialContext = parseContextFromSearchParams(resolvedSearchParams);
  const bannerMessage = config.showBannerMessage
    ? settings.find((s) => s.key === "widget_banner_message")?.value || null
    : null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <WidgetForm
        form={config}
        categories={categories}
        customFields={activeCustomFields}
        initialContext={initialContext}
        bannerMessage={bannerMessage}
      />
    </div>
  );
}
