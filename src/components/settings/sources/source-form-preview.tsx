"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SourceFieldInput } from "@/components/widget/source-field-input";
import { CustomFieldInput } from "@/components/tickets/ticket-detail/custom-field-input";
import type { SourceConfig } from "@/lib/sources";
import type { CustomField, TicketCategory } from "@/generated/prisma/client";

const NONE = "__none__";

/**
 * Rendu du formulaire public à partir des réglages en cours d'édition (avant
 * enregistrement). Les champs sont réellement utilisables — c'est le même
 * composant de rendu que le formulaire public — mais rien n'est envoyé.
 */
export function SourceFormPreview({
  config,
  categories,
  customFields,
  bannerMessage,
}: {
  config: SourceConfig;
  categories: TicketCategory[];
  customFields: CustomField[];
  bannerMessage: string | null;
}) {
  const [categoryId, setCategoryId] = useState(NONE);
  const [values, setValues] = useState<Record<string, unknown>>({});

  const globalFields = config.useGlobalCustomFields ? customFields : [];
  const banner = config.showBannerMessage ? bannerMessage : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
          /widget?source={config.slug}
        </span>
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
        <div className="flex flex-col gap-5 p-6">
          <div className="space-y-3">
            {config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="" className="h-8 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {config.formTitle || "Titre du formulaire"}
              </h1>
              {config.formDescription && (
                <p className="text-sm text-muted-foreground">{config.formDescription}</p>
              )}
            </div>
          </div>

          {banner && (
            <div className="rounded-md border border-primary/30 bg-primary/10 px-3.5 py-3 text-sm font-medium leading-snug text-foreground">
              {banner}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input className="h-10" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" className="h-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sujet</Label>
            <Input className="h-10" />
          </div>

          {config.showCategoryField && (
            <div className="space-y-2">
              <Label>Produit concerné</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Non spécifié</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {globalFields.map((field) => (
            <CustomFieldInput
              key={field.id}
              field={field}
              value={values[field.key]}
              onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
            />
          ))}

          {config.fields.map((field) => (
            <SourceFieldInput
              // L'aperçu n'a pas de clé de stockage : l'id du champ en fait office.
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(value) => setValues((prev) => ({ ...prev, [field.id]: value }))}
            />
          ))}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={5}
              placeholder={
                config.allowAttachments
                  ? "Décrivez votre problème… (vous pouvez coller ou glisser une capture d'écran)"
                  : "Décrivez votre problème…"
              }
            />
            {config.allowAttachments && (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <ImagePlus className="h-4 w-4" />
              </div>
            )}
          </div>

          <Button type="button" disabled className="mt-1 h-10 w-full text-sm">
            {config.submitLabel || "Envoyer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
