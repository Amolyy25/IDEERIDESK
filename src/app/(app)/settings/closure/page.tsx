import { auth } from "@/auth";
import { getClosureTemplate } from "@/lib/actions/closure-settings";
import { ClosureTemplateForm } from "@/components/settings/closure/closure-template-form";

export default async function ClosureSettingsPage() {
  const session = await auth();

  if (session?.user?.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Cette page est réservée aux administrateurs.
      </p>
    );
  }

  const template = await getClosureTemplate();
  const logoUrl = process.env.APP_URL ? `${process.env.APP_URL}/logoIdeeri.jpeg` : null;

  return <ClosureTemplateForm template={template} logoUrl={logoUrl} />;
}
