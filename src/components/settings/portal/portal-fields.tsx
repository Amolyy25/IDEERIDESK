"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PORTAL_ICON_NAMES, type PortalLink } from "@/lib/portal-theme";
import { PortalIcon } from "@/components/portal/portal-icon";

/** Interrupteur avec titre et explication, dans une carte bordée. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3.5 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Champ texte sur une ligne. Une chaîne vide est remontée telle quelle. */
export function TextField({
  label,
  hint,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Champ texte multiligne. */
export function TextAreaField({
  label,
  hint,
  value,
  placeholder,
  maxLength,
  rows = 3,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Couleur : sélecteur natif + saisie hexadécimale. `nullable` ajoute un bouton
 * de remise à la valeur du thème (utile pour les couleurs facultatives comme le
 * fond ou les bordures, où « vide » veut dire « ne pas surcharger »).
 */
export function ColorField({
  label,
  hint,
  value,
  fallback,
  nullable = false,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  /** Couleur affichée dans le sélecteur quand `value` est vide. */
  fallback: string;
  nullable?: boolean;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={nullable ? `${fallback} (thème)` : fallback}
          spellCheck={false}
          className="font-mono text-xs"
        />
        {nullable && value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
            title="Revenir à la couleur du thème"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { key: T; label: string }[] | readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const items = options.map((option) =>
    "key" in option
      ? { value: option.key, label: option.label }
      : { value: option.value, label: option.label },
  );
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Choix d'une icône parmi la liste blanche PORTAL_ICONS, avec aperçu. */
export function IconField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <span className="flex items-center gap-2">
            <PortalIcon name={value} fallback="CircleHelp" className="h-4 w-4 text-primary" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {PORTAL_ICON_NAMES.map((name) => (
            <SelectItem key={name} value={name}>
              <span className="flex items-center gap-2">
                <PortalIcon name={name} fallback="CircleHelp" className="h-4 w-4" />
                {name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Éditeur de liens libres (navigation ou pied de page). */
export function LinkListField({
  label,
  hint,
  links,
  max = 8,
  onChange,
}: {
  label: string;
  hint?: string;
  links: PortalLink[];
  max?: number;
  onChange: (links: PortalLink[]) => void;
}) {
  function update(index: number, patch: Partial<PortalLink>) {
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={index} className="rounded-md border p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="p-0.5 disabled:opacity-30"
                    title="Monter"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === links.length - 1}
                    className="p-0.5 disabled:opacity-30"
                    title="Descendre"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={link.label}
                    onChange={(e) => update(index, { label: e.target.value })}
                    placeholder="Libellé"
                    maxLength={60}
                  />
                  <Input
                    value={link.href}
                    onChange={(e) => update(index, { href: e.target.value })}
                    placeholder="/page, #ancre ou https://…"
                    spellCheck={false}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(links.filter((_, i) => i !== index))}
                  title="Supprimer ce lien"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <label className="mt-2 flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                <Switch
                  checked={link.newTab}
                  onCheckedChange={(checked) => update(index, { newTab: checked })}
                />
                Ouvrir dans un nouvel onglet
              </label>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={links.length >= max}
        onClick={() => onChange([...links, { label: "", href: "", newTab: false }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter un lien
      </Button>
    </div>
  );
}

/**
 * Téléversement du logo ou du favicon. Le fichier part vers
 * /api/portal/assets, qui l'enregistre et l'associe immédiatement aux réglages
 * (indépendamment du bouton « Enregistrer » du formulaire).
 */
export function AssetField({
  label,
  hint,
  kind,
  assetId,
  accept,
  previewClassName,
  onUploaded,
  onDeleted,
}: {
  label: string;
  hint?: string;
  kind: "logo" | "favicon";
  assetId: string | null;
  accept: string;
  previewClassName?: string;
  onUploaded: (id: string) => void;
  onDeleted: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function upload(file: File) {
    setIsBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const response = await fetch("/api/portal/assets", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Téléversement impossible");
      onUploaded(payload.id);
      toast.success("Visuel mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléversement impossible");
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3 rounded-md border p-3">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted/60">
          {assetId ? (
            // <img> volontaire : le visuel vient d'une route API dynamique et
            // change à chaque téléversement (pas d'optimisation next/image utile).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/portal/assets/${assetId}`}
              alt=""
              className={cn("max-h-10 max-w-14 object-contain", previewClassName)}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">Aucun</span>
          )}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {isBusy ? "Envoi…" : assetId ? "Remplacer" : "Téléverser"}
          </Button>
          {assetId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={async () => {
                setIsBusy(true);
                try {
                  await onDeleted();
                  toast.success("Visuel retiré");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Suppression impossible");
                } finally {
                  setIsBusy(false);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Retirer
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
