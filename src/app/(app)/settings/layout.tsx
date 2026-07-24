import { SettingsTabs } from "@/components/settings/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Configurez le fonctionnement d&apos;Ideeri Desk.
        </p>
      </div>

      <SettingsTabs />

      <div>{children}</div>
    </div>
  );
}
