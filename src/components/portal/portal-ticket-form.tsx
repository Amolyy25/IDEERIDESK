"use client";

import { useEffect, useRef, useState } from "react";
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
import { AttachmentPreview } from "@/components/widget/attachment-preview";
import { KnowledgeSuggestions } from "@/components/widget/knowledge-suggestions";
import { SourceFieldInput } from "@/components/widget/source-field-input";
import { CustomFieldInput } from "@/components/tickets/ticket-detail/custom-field-input";
import { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachment-rules";
import { isDecorativeField, type SourceFormView } from "@/lib/sources";
import type { CustomField, TicketCategory } from "@/generated/prisma/client";

const NONE = "__none__";

type Attachment = { file: File; previewUrl: string };

export function PortalTicketForm({
  form,
  categories,
  customFields,
}: {
  /**
   * Formulaire configuré pour la source « portail » (cf. /settings/sources).
   * Seuls les champs et blocs sont repris ici : l'habillage du portail (logo,
   * titres) reste piloté par les réglages du portail.
   */
  form: SourceFormView;
  categories: TicketCategory[];
  customFields: CustomField[];
}) {
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [sourceFieldValues, setSourceFieldValues] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [kbArticles, setKbArticles] = useState<
    { id: string; title: string; excerpt: string | null; content: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suggère des articles pendant la saisie, pour éviter d'ouvrir un ticket si
  // la réponse existe déjà — débounced pour ne pas interroger à chaque frappe.
  useEffect(() => {
    const query = `${subject} ${description}`.trim();

    const timeout = setTimeout(async () => {
      if (query.length < 3) {
        setKbArticles([]);
        return;
      }
      try {
        const response = await fetch(`/api/widget/knowledge-base?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const result = await response.json();
        setKbArticles(result.articles ?? []);
      } catch {
        // Suggestion non bloquante.
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [subject, description]);

  function addFiles(files: File[]) {
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers.`);
      return;
    }

    const accepted: Attachment[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      const error = validateAttachmentFile(file);
      if (error) {
        setAttachmentError(error);
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    if (accepted.length) {
      setAttachmentError(null);
      setAttachments((prev) => [...prev, ...accepted]);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    // La zone de pièces jointes peut être désactivée pour la source ; un champ
    // « fichier » du formulaire, lui, reste toujours opérant.
    if (!form.allowAttachments) return;

    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) addFiles(files);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (!form.allowAttachments) return;
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const missingField = customFields.find((field) => {
      if (!field.isRequired) return false;
      const value = customFieldValues[field.key];
      return value === undefined || value === null || value === "" || value === false;
    });
    if (missingField) {
      setFormError(`Le champ « ${missingField.label} » est obligatoire.`);
      return;
    }

    const missingSourceField = form.fields.find((field) => {
      if (!field.isRequired || isDecorativeField(field.type)) return false;
      if (field.type === "FILE") return attachments.length === 0;
      const value = sourceFieldValues[field.key];
      return value === undefined || value === null || value === "" || value === false;
    });
    if (missingSourceField) {
      setFormError(`Le champ « ${missingSourceField.label} » est obligatoire.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("subject", subject);
      formData.set("description", description);
      formData.set("email", email);
      if (name) formData.set("name", name);
      if (categoryId !== NONE) formData.set("categoryId", categoryId);
      if (form.slug) formData.set("sourceSlug", form.slug);
      if (customFields.length || form.fields.length) {
        formData.set(
          "customFields",
          JSON.stringify({ ...customFieldValues, ...sourceFieldValues })
        );
      }
      attachments.forEach((attachment) => formData.append("attachments", attachment.file));

      const response = await fetch("/api/portal/tickets", { method: "POST", body: formData });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Une erreur est survenue.");
      }

      setTicketNumber(result.number);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (ticketNumber !== null) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Ticket #{ticketNumber} créé</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {form.successMessage ||
            "Nous avons bien reçu votre demande, vous recevrez une réponse par email."}
        </p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => {
            setTicketNumber(null);
            setSubject("");
            setDescription("");
            setCategoryId(NONE);
            setCustomFieldValues({});
            setSourceFieldValues({});
            setAttachments([]);
          }}
        >
          Créer un autre ticket
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border bg-card p-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="name">Nom</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="h-10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Sujet</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          className="h-10"
        />
      </div>

      <KnowledgeSuggestions articles={kbArticles} />

      {form.showCategoryField && categories.length > 0 && (
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

      {customFields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={customFieldValues[field.key]}
          onChange={(value) => setCustomFieldValues((prev) => ({ ...prev, [field.key]: value }))}
        />
      ))}

      {form.fields.map((field) => (
        <SourceFieldInput
          key={field.id}
          field={field}
          value={sourceFieldValues[field.key]}
          onChange={(value) => setSourceFieldValues((prev) => ({ ...prev, [field.key]: value }))}
          onFiles={addFiles}
        />
      ))}

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={isDraggingOver ? "rounded-md ring-2 ring-primary ring-offset-1" : "rounded-md"}
        >
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={handlePaste}
            required
            rows={5}
            placeholder="Décrivez votre problème… (vous pouvez coller ou glisser une capture d'écran)"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {attachments.map((attachment, index) => (
            <AttachmentPreview
              key={attachment.previewUrl}
              file={attachment.file}
              previewUrl={attachment.previewUrl}
              onRemove={() => removeAttachment(index)}
            />
          ))}

          {form.allowAttachments && attachments.length < MAX_ATTACHMENTS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
        {attachmentError && <p className="text-sm text-destructive">{attachmentError}</p>}
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" disabled={isSubmitting} className="h-10 w-full text-sm">
        {isSubmitting ? "Envoi…" : form.submitLabel}
      </Button>
    </form>
  );
}
