import { KbTabs } from "@/components/knowledge-base/kb-tabs";

export default function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Base de connaissances</h1>
        <p className="text-sm text-muted-foreground">
          Documentez les solutions récurrentes pour vos agents et vos clients.
        </p>
      </div>

      <KbTabs />

      <div>{children}</div>
    </div>
  );
}
