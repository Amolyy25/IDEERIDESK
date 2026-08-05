import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { visibleSettingsGroups } from "@/lib/settings-navigation";
import { defaultLandingPath } from "@/lib/app-navigation";

export default async function SettingsPage() {
  const session = await auth();
  const permissions = session?.user?.permissions;

  // Première section que l'agent peut réellement ouvrir : il atterrirait sinon
  // sur une page qui le renverrait aussitôt ailleurs.
  const target = visibleSettingsGroups(permissions).at(0)?.items.at(0);

  redirect(target?.href ?? defaultLandingPath(permissions));
}
