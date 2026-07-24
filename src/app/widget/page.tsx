import type { Metadata } from "next";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getGlobalSettings } from "@/lib/actions/settings";
import { WidgetForm } from "@/components/widget/widget-form";
import { parseContextFromSearchParams, type RawSearchParams } from "@/lib/papairis-context";

export const metadata: Metadata = {
  title: "Contacter le support — Ideeri",
};

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [resolvedSearchParams, categories, customFields, settings] = await Promise.all([
    searchParams,
    getTicketCategories(),
    getCustomFields(),
    getGlobalSettings(),
  ]);

  const activeCustomFields = customFields.filter((field) => field.isActive);
  const initialContext = parseContextFromSearchParams(resolvedSearchParams);
  const bannerMessage = settings.find((s) => s.key === "widget_banner_message")?.value || null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <WidgetForm
        categories={categories}
        customFields={activeCustomFields}
        initialContext={initialContext}
        bannerMessage={bannerMessage}
      />
    </div>
  );
}
