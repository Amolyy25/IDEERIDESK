"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SourceFieldCard } from "@/components/settings/sources/source-field-card";
import { SourceFormPreview } from "@/components/settings/sources/source-form-preview";
import { updateSource } from "@/lib/actions/sources";
import {
  MAX_SOURCE_FIELDS,
  SOURCE_FIELD_TYPES,
  TICKET_SOURCE_OPTIONS,
  createEmptyField,
  sourceConfigSchema,
  sourceFormPath,
  type SourceConfig,
  type SourceFormField,
} from "@/lib/sources";
import type { CustomField, SourceFieldType, TicketCategory } from "@/generated/prisma/client";

/** Interrupteur avec titre et explication, dans une carte bordée. */
function ToggleRow({
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

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SourceFormBuilder({
  id,
  source,
  categories,
  customFields,
  bannerMessage,
}: {
  id: string;
  source: SourceConfig;
  categories: TicketCategory[];
  customFields: CustomField[];
  bannerMessage: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<SourceConfig>(source);
  const [saved, setSaved] = useState<SourceConfig>(source);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isDirty = JSON.stringify(config) !== JSON.stringify(saved);

  function set<K extends keyof SourceConfig>(key: K, value: SourceConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  // Un texte vidé vaut « pas de valeur » côté base, d'où la conversion en null.
  function setText<K extends keyof SourceConfig>(key: K, value: string) {
    set(key, (value.trim() === "" ? null : value) as SourceConfig[K]);
  }

  function setFields(fields: SourceFormField[]) {
    set("fields", fields);
  }

  function addField(type: SourceFieldType) {
    if (config.fields.length >= MAX_SOURCE_FIELDS) {
      toast.error(`${MAX_SOURCE_FIELDS} champs au maximum par formulaire.`);
      return;
    }
    setFields([...config.fields, createEmptyField(type)]);
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= config.fields.length) return;
    const next = [...config.fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  /** Réordonne pendant le glisser-déposer : la carte survolée prend la place. */
  function dragOver(index: number) {
    if (draggedIndex === null || draggedIndex === index) return;
    const next = [...config.fields];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    setDraggedIndex(index);
    setFields(next);
  }

  async function uploadLogo(file: File) {
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/sources/assets", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Téléversement impossible");
      set("logoUrl", payload.url);
      toast.success("Visuel ajouté — enregistrez pour l'appliquer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléversement impossible");
    } finally {
      setIsUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function handleSave() {
    const parsed = sourceConfigSchema.safeParse(config);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Réglages invalides");
      return;
    }
    startSaving(async () => {
      try {
        await updateSource(id, parsed.data);
        setConfig(parsed.data);
        setSaved(parsed.data);
        toast.success("Formulaire enregistré");
        // Les champs créés reçoivent leur id définitif côté serveur : on
        // recharge pour que le builder travaille sur les vraies lignes.
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/settings/sources"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Sources
          </Link>
          <h2 className="mt-1 truncate text-sm font-medium">{config.name}</h2>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={sourceFormPath(saved.slug)} target="_blank">
              <ExternalLink className="size-4" />
              Voir
            </Link>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------------- Panneau de configuration ---------------- */}
        <div className="min-w-0 space-y-6">
          <div className="space-y-4">
            <SectionTitle
              title="Habillage"
              hint="Ce que voit le visiteur en haut du formulaire."
            />

            <div className="space-y-2">
              <Label>Logo ou image d&apos;en-tête</Label>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted/60">
                  {config.logoUrl ? (
                    // <img> volontaire : visuel servi par une route API dynamique
                    // ou par une URL externe, next/image n'apporte rien ici.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={config.logoUrl}
                      alt=""
                      className="max-h-10 max-w-14 object-contain"
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
                    disabled={isUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    {isUploading ? "Envoi…" : config.logoUrl ? "Remplacer" : "Téléverser"}
                  </Button>
                  {config.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set("logoUrl", null)}
                    >
                      <Trash2 className="size-4" />
                      Retirer
                    </Button>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
              </div>
              <Input
                value={config.logoUrl ?? ""}
                spellCheck={false}
                maxLength={500}
                placeholder="…ou collez une URL d'image"
                className="font-mono text-xs"
                onChange={(event) => setText("logoUrl", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG ou WEBP, 1 Mo maximum.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Titre du formulaire</Label>
              <Input
                value={config.formTitle}
                maxLength={120}
                onChange={(event) => set("formTitle", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Message d&apos;accueil</Label>
              <Textarea
                value={config.formDescription ?? ""}
                rows={2}
                maxLength={500}
                placeholder="Affiché sous le titre."
                onChange={(event) => setText("formDescription", event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Libellé du bouton d&apos;envoi</Label>
                <Input
                  value={config.submitLabel}
                  maxLength={40}
                  onChange={(event) => set("submitLabel", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Message de confirmation</Label>
                <Input
                  value={config.successMessage ?? ""}
                  maxLength={500}
                  placeholder="Affiché après l'envoi."
                  onChange={(event) => setText("successMessage", event.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ---------------- Champs ---------------- */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <SectionTitle
                title="Champs du formulaire"
                hint="Ajoutés après le sujet, avant la description. Réordonnables."
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="size-4" />
                    Ajouter un champ
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SOURCE_FIELD_TYPES.map((type) => (
                    <DropdownMenuItem key={type.value} onSelect={() => addField(type.value)}>
                      {type.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {config.fields.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun champ ajouté : le formulaire se limite aux informations de base.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {config.fields.map((field, index) => (
                  <SourceFieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    count={config.fields.length}
                    isDragging={draggedIndex === index}
                    onChange={(patch) =>
                      setFields(
                        config.fields.map((current, i) =>
                          i === index ? { ...current, ...patch } : current,
                        ),
                      )
                    }
                    onMove={(direction) => moveField(index, direction)}
                    onRemove={() => setFields(config.fields.filter((_, i) => i !== index))}
                    onDragStart={() => setDraggedIndex(index)}
                    onDragEnter={() => dragOver(index)}
                    onDragEnd={() => setDraggedIndex(null)}
                  />
                ))}
              </div>
            )}

            <ToggleRow
              label="Reprendre les champs personnalisés globaux"
              hint="Les champs définis dans Paramètres > Champs personnalisés s'ajoutent à ceux ci-dessus."
              checked={config.useGlobalCustomFields}
              onChange={(value) => set("useGlobalCustomFields", value)}
            />
          </div>

          <Separator />

          {/* ---------------- Blocs standards ---------------- */}
          <div className="space-y-4">
            <SectionTitle
              title="Blocs standards"
              hint="Les éléments communs à tous les formulaires de ticket."
            />
            <div className="space-y-2">
              <ToggleRow
                label="Choix du produit concerné"
                checked={config.showCategoryField}
                onChange={(value) => set("showCategoryField", value)}
              />
              <ToggleRow
                label="Pièces jointes"
                hint="Copier-coller, glisser-déposer et sélecteur de captures d'écran."
                checked={config.allowAttachments}
                onChange={(value) => set("allowAttachments", value)}
              />
              <ToggleRow
                label="Bandeau d'aide global"
                hint="Le message défini dans Paramètres > Général."
                checked={config.showBannerMessage}
                onChange={(value) => set("showBannerMessage", value)}
              />
            </div>
          </div>

          <Separator />

          {/* ---------------- Réglages de la source ---------------- */}
          <div className="space-y-4">
            <SectionTitle title="Réglages de la source" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={config.name}
                  maxLength={80}
                  onChange={(event) => set("name", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Identifiant d&apos;intégration</Label>
                <Input
                  value={config.slug}
                  maxLength={60}
                  spellCheck={false}
                  className="font-mono text-xs"
                  onChange={(event) => set("slug", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Le modifier change l&apos;adresse du formulaire et casse les intégrations
                  existantes.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description interne</Label>
              <Textarea
                value={config.description ?? ""}
                rows={2}
                maxLength={300}
                placeholder="Visible seulement des agents, dans la liste des sources."
                onChange={(event) => setText("description", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Classer les tickets comme</Label>
              <Select
                value={config.ticketSource}
                onValueChange={(value) =>
                  set("ticketSource", value as SourceConfig["ticketSource"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Détermine le badge d&apos;origine affiché sur les tickets reçus.
              </p>
            </div>

            <ToggleRow
              label="Source active"
              hint="Désactivée, son formulaire n'accepte plus aucune soumission."
              checked={config.isActive}
              onChange={(value) => set("isActive", value)}
            />
          </div>
        </div>

        {/* ---------------- Aperçu en direct ---------------- */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <p className="mb-2 text-xs text-muted-foreground">
            Aperçu en direct — reflète les réglages en cours, avant enregistrement.
          </p>
          <SourceFormPreview
            config={config}
            categories={categories}
            customFields={customFields}
            bannerMessage={bannerMessage}
          />
        </div>
      </div>
    </div>
  );
}
