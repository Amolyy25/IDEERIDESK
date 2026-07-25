import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getSourceConfig } from "@/lib/actions/sources";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getGlobalSettings } from "@/lib/actions/settings";
import { SourceFormBuilder } from "@/components/settings/sources/source-form-builder";
import { SettingsAdminOnly } from "@/components/settings/settings-section";

export default async function SourceBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return <SettingsAdminOnly href="/settings/sources" />;
  }

  const [source, categories, customFields, settings] = await Promise.all([
    getSourceConfig(id),
    getTicketCategories(),
    getCustomFields(),
    getGlobalSettings(),
  ]);

  if (!source) {
    notFound();
  }

  return (
    <SourceFormBuilder
      id={id}
      source={source}
      categories={categories}
      customFields={customFields.filter((field) => field.isActive)}
      bannerMessage={settings.find((s) => s.key === "widget_banner_message")?.value || null}
    />
  );
}
