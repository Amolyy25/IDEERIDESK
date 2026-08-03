"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateGlobalSetting } from "@/lib/actions/settings";
import type { GlobalSetting } from "@/generated/prisma/client";

/**
 * Regroupement des réglages par sujet. L'ordre d'affichage suit cette liste :
 * un tri sur le libellé mélangeait des réglages sans rapport entre eux. Les
 * clés inconnues (réglage ajouté plus tard) atterrissent dans « Autres ».
 */
const GROUPS: { label: string; keys: string[] }[] = [
  { label: "Identité", keys: ["company_name"] },
  { label: "Support", keys: ["support_email", "timezone"] },
  { label: "Formulaires publics", keys: ["widget_banner_message"] },
];

export function GeneralSettingsForm({ settings }: { settings: GlobalSetting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
    },
    [],
  );

  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const grouped = GROUPS.map((group) => ({
    label: group.label,
    settings: group.keys
      .map((key) => byKey.get(key))
      .filter((setting): setting is GlobalSetting => Boolean(setting)),
  })).filter((group) => group.settings.length > 0);

  const knownKeys = new Set(GROUPS.flatMap((group) => group.keys));
  const others = settings.filter((setting) => !knownKeys.has(setting.key));
  if (others.length > 0) {
    grouped.push({ label: "Autres réglages", settings: others });
  }

  async function handleBlur(key: string, initialValue: string) {
    const value = values[key];
    if (value === initialValue) return;

    setSavingKey(key);
    try {
      await updateGlobalSetting(key, value);
      setSavedKey(key);
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setSavedKey(null), 2400);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer");
      setValues((prev) => ({ ...prev, [key]: initialValue }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.label} className="rounded-lg border bg-card">
          <p className="border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="divide-y">
            {group.settings.map((setting) => (
              <div
                key={setting.key}
                className="gap-4 px-4 py-4 sm:grid sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={setting.key}>{setting.label}</Label>
                    {savingKey === setting.key && (
                      <span className="text-xs text-muted-foreground">Enregistrement…</span>
                    )}
                    {savedKey === setting.key && savingKey !== setting.key && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Check className="size-3.5" />
                        Enregistré
                      </span>
                    )}
                  </div>
                  {setting.description && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {setting.description}
                    </p>
                  )}
                </div>

                <div className="mt-2 sm:mt-0">
                  {setting.multiline ? (
                    <Textarea
                      id={setting.key}
                      value={values[setting.key] ?? ""}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [setting.key]: event.target.value }))
                      }
                      onBlur={() => handleBlur(setting.key, setting.value)}
                      disabled={savingKey === setting.key}
                      rows={4}
                    />
                  ) : (
                    <Input
                      id={setting.key}
                      value={values[setting.key] ?? ""}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [setting.key]: event.target.value }))
                      }
                      onBlur={() => handleBlur(setting.key, setting.value)}
                      disabled={savingKey === setting.key}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Chaque champ est enregistré dès que vous en sortez.
      </p>
    </div>
  );
}
