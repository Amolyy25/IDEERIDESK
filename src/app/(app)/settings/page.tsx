import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SETTINGS_GROUPS } from "@/lib/settings-navigation";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  // Première section accessible à l'agent : un agent non administrateur
  // atterrirait sinon sur une page qu'il n'a pas le droit de consulter.
  const target = SETTINGS_GROUPS.flatMap((group) => group.items).find(
    (item) => isAdmin || !item.adminOnly,
  );

  redirect(target?.href ?? "/tickets");
}
