"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateGlobalSetting } from "@/lib/actions/settings";
import type { GlobalSetting } from "@/generated/prisma/client";

export function GeneralSettingsForm({ settings }: { settings: GlobalSetting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value]))
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function handleBlur(key: string, initialValue: string) {
    const value = values[key];
    if (value === initialValue) return;

    setSavingKey(key);
    try {
      await updateGlobalSetting(key, value);
      toast.success("Paramètre enregistré");
    } catch {
      toast.error("Impossible d'enregistrer");
      setValues((prev) => ({ ...prev, [key]: initialValue }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      {settings.map((setting) => (
        <div key={setting.key} className="space-y-1.5">
          <Label htmlFor={setting.key}>{setting.label}</Label>
          {setting.multiline ? (
            <Textarea
              id={setting.key}
              value={values[setting.key] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
              }
              onBlur={() => handleBlur(setting.key, setting.value)}
              disabled={savingKey === setting.key}
              rows={3}
            />
          ) : (
            <Input
              id={setting.key}
              value={values[setting.key] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
              }
              onBlur={() => handleBlur(setting.key, setting.value)}
              disabled={savingKey === setting.key}
            />
          )}
          {setting.description && (
            <p className="text-xs text-muted-foreground">{setting.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
