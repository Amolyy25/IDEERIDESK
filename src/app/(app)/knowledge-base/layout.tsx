import { KbTabs } from "@/components/knowledge-base/kb-tabs";
import { requirePageAccess } from "@/lib/require-page-access";
import { can } from "@/lib/permissions";

// Garde posée sur le layout et non sur chaque page : elle couvre ainsi la liste,
// l'éditeur et les sous-pages d'un coup, y compris celles ajoutées plus tard.
export default async function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageAccess("kb.view");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Base de connaissances</h1>
        <p className="text-sm text-muted-foreground">
          Documentez les solutions récurrentes pour vos agents et vos clients.
        </p>
      </div>

      <KbTabs canManage={can(session.user.permissions, "kb.manage")} />

      <div>{children}</div>
    </div>
  );
}
