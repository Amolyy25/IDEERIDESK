/**
 * Contrat unique des sources de tickets : types du formulaire, valeurs par
 * défaut et schémas de validation.
 *
 * Importé côté serveur (server actions, widget public) ET côté client (form
 * builder, aperçu en direct) — ne rien mettre ici qui touche Prisma.
 */

import { z } from "zod";
import type { SourceFieldType, TicketSource } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types de champs proposés dans le builder
// ---------------------------------------------------------------------------

export const SOURCE_FIELD_TYPES: readonly { value: SourceFieldType; label: string }[] = [
  { value: "TEXT", label: "Texte court" },
  { value: "TEXTAREA", label: "Texte long" },
  { value: "SELECT", label: "Choix multiple" },
  { value: "CHECKBOX", label: "Case à cocher" },
  { value: "FILE", label: "Fichier / capture" },
  { value: "HEADER", label: "Titre de section" },
];

export const sourceFieldTypeLabels = Object.fromEntries(
  SOURCE_FIELD_TYPES.map((type) => [type.value, type.label]),
) as Record<SourceFieldType, string>;

/** Types qui ne collectent aucune réponse : ni obligatoires, ni stockés. */
export function isDecorativeField(type: SourceFieldType) {
  return type === "HEADER";
}

/** Les sources auxquelles une source peut se rattacher (classification enum). */
export const TICKET_SOURCE_OPTIONS: readonly { value: TicketSource; label: string }[] = [
  { value: "WIDGET_PAPAIRIS", label: "Widget Papairis" },
  { value: "PORTAL", label: "Portail" },
  { value: "DIRECT", label: "Formulaire web" },
];

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

export const sourceFieldSchema = z.object({
  // Id de la ligne en base, ou identifiant temporaire (`new-…`) pour un champ
  // ajouté dans le builder et pas encore enregistré.
  id: z.string().min(1),
  type: z.enum(["TEXT", "TEXTAREA", "SELECT", "CHECKBOX", "FILE", "HEADER"]),
  label: z.string().trim().min(1, "Chaque champ doit avoir un libellé").max(80),
  placeholder: z.string().trim().max(160).nullable(),
  helpText: z.string().trim().max(300).nullable(),
  isRequired: z.boolean(),
  options: z.array(z.string().trim().min(1)).max(40),
});

export type SourceFormField = z.infer<typeof sourceFieldSchema>;

export const MAX_SOURCE_FIELDS = 30;

export const sourceSlugSchema = z
  .string()
  .trim()
  .min(1, "Identifiant requis")
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Identifiant invalide : minuscules, chiffres et tirets uniquement",
  );

export const sourceConfigSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80),
  slug: sourceSlugSchema,
  description: z.string().trim().max(300).nullable(),
  isActive: z.boolean(),
  ticketSource: z.enum(["WIDGET_PAPAIRIS", "EMAIL", "DIRECT", "PORTAL"]),

  logoUrl: z.string().trim().max(500).nullable(),

  formTitle: z.string().trim().min(1, "Titre du formulaire requis").max(120),
  formDescription: z.string().trim().max(500).nullable(),
  submitLabel: z.string().trim().min(1, "Libellé du bouton requis").max(40),
  successMessage: z.string().trim().max(500).nullable(),

  showCategoryField: z.boolean(),
  allowAttachments: z.boolean(),
  showBannerMessage: z.boolean(),
  useGlobalCustomFields: z.boolean(),

  fields: z.array(sourceFieldSchema).max(MAX_SOURCE_FIELDS),
});

export type SourceConfig = z.infer<typeof sourceConfigSchema>;

/**
 * Champ tel que servi à un formulaire public : la clé de stockage dans
 * `Ticket.metadata` accompagne le champ, c'est elle que la soumission renvoie.
 */
export type SourcePublicField = SourceFormField & { key: string };

/** Réglages du formulaire seuls, sans les métadonnées de la source. */
export type SourceFormRendering = Pick<
  SourceConfig,
  | "logoUrl"
  | "formTitle"
  | "formDescription"
  | "submitLabel"
  | "successMessage"
  | "showCategoryField"
  | "allowAttachments"
  | "showBannerMessage"
> & { fields: SourcePublicField[] };

/**
 * Ce que reçoit un formulaire public : les réglages de rendu et le slug à
 * renvoyer à l'API (null si aucune source n'a pu être résolue).
 */
export type SourceFormView = SourceFormRendering & { slug: string | null };

export const SOURCE_FORM_DEFAULTS: SourceFormRendering = {
  logoUrl: null,
  formTitle: "Contacter le support",
  formDescription: "Décrivez votre problème, nous vous répondrons rapidement.",
  submitLabel: "Envoyer",
  successMessage: null,
  showCategoryField: true,
  allowAttachments: true,
  showBannerMessage: true,
  fields: [],
};

// ---------------------------------------------------------------------------
// Identifiants
// ---------------------------------------------------------------------------

/** Slug URL-safe dérivé d'un libellé libre (« Widget Papairis » → `widget-papairis`). */
export function slugifySource(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clé de stockage dans `Ticket.metadata`, dérivée du libellé du champ. */
export function fieldKeyFromLabel(label: string) {
  return slugifySource(label).replace(/-/g, "_");
}

export function newFieldId() {
  // `crypto.randomUUID` est disponible côté navigateur comme côté Node : le
  // builder crée les champs en local, le serveur leur attribue un vrai cuid.
  return `new-${crypto.randomUUID()}`;
}

export function isPersistedFieldId(id: string) {
  return !id.startsWith("new-");
}

/** Champ vierge ajouté par le bouton « Ajouter un champ » du builder. */
export function createEmptyField(type: SourceFieldType): SourceFormField {
  return {
    id: newFieldId(),
    type,
    label: type === "HEADER" ? "Nouvelle section" : sourceFieldTypeLabels[type],
    placeholder: null,
    helpText: null,
    isRequired: false,
    options: type === "SELECT" ? ["Option A", "Option B"] : [],
  };
}

// ---------------------------------------------------------------------------
// Intégration
// ---------------------------------------------------------------------------

export function sourceFormPath(slug: string) {
  return `/widget?source=${encodeURIComponent(slug)}`;
}

export function sourceEmbedSnippet(origin: string, slug: string) {
  return `<iframe
  src="${origin}${sourceFormPath(slug)}"
  title="Support"
  width="480"
  height="720"
  style="border:0;border-radius:12px"
></iframe>`;
}
