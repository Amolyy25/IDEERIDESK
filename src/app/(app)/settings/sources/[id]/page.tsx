import { notFound } from "next/navigation";
import { getSourceConfig } from "@/lib/actions/sources";
import { getTicketCategories } from "@/lib/actions/categories";
import { getCustomFields } from "@/lib/actions/custom-fields";
import { getGlobalSettings } from "@/lib/actions/settings";
import { SourceFormBuilder } from "@/components/settings/sources/source-form-builder";
import { SettingsNoAccess, canOpenSettings } from "@/components/settings/settings-section";

export default async function SourceBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // L'éditeur d'une source n'a pas d'entrée propre dans le plan des réglages :
  // il partage la permission de la liste qui y mène.
  if (!(await canOpenSettings("/settings/sources"))) {
    return <SettingsNoAccess href="/settings/sources" />;
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
