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
import { WidgetSuccess } from "@/components/widget/widget-success";
import {
  KnowledgeSuggestions,
  type SuggestedArticle,
} from "@/components/widget/knowledge-suggestions";
import { SourceFieldInput } from "@/components/widget/source-field-input";
import { CustomFieldInput } from "@/components/tickets/ticket-detail/custom-field-input";
import { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachment-rules";
import { isDecorativeField, type SourceFormView } from "@/lib/sources";
import {
  isPapairisContextMessage,
  PAPAIRIS_CLOSE_MESSAGE_TYPE,
  PAPAIRIS_TICKET_CREATED_MESSAGE_TYPE,
  type PapairisContext,
} from "@/lib/papairis-context";
import type { CustomField, TicketCategory } from "@/generated/prisma/client";

const NONE = "__none__";

type Attachment = { file: File; previewUrl: string };

export function WidgetForm({
  form,
  categories,
  customFields,
  initialContext,
  bannerMessage,
}: {
  /** Formulaire configuré pour la source appelée (cf. /settings/sources). */
  form: SourceFormView;
  categories: TicketCategory[];
  customFields: CustomField[];
  initialContext: PapairisContext;
  bannerMessage: string | null;
}) {
  // `initialContext` is resolved server-side (Next's `searchParams`) so the very
  // first render is identical on the server and on the client — reading
  // `window.location.search` here instead would branch on `typeof window` and
  // produce a hydration mismatch (server sees no `window`, client does).
  const [context, setContext] = useState<PapairisContext>(initialContext);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(() => {
    const values: Record<string, unknown> = {};
    for (const field of customFields) {
      if (field.type === "TEXT" && field.autofillFromSourceUrl && initialContext.sourceUrl) {
        values[field.key] = initialContext.sourceUrl;
      }
    }
    return values;
  });
  const [sourceFieldValues, setSourceFieldValues] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [kbArticles, setKbArticles] = useState<SuggestedArticle[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (isPapairisContextMessage(event.data)) {
        setContext((prev) => ({ ...prev, ...event.data.payload }));
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Suggère des articles de la base de connaissances pendant la saisie, pour
  // éviter au client d'ouvrir un ticket si la réponse existe déjà — débounced
  // pour ne pas interroger l'API à chaque frappe.
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
        // Suggestion non bloquante : une erreur réseau ne doit pas gêner l'envoi du ticket.
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [subject, description]);

  const isIdentified = Boolean(context.userEmail);

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

  function sendToParent(type: string, payload?: Record<string, unknown>) {
    window.parent?.postMessage({ type, payload }, "*");
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

    // Les champs de la source sont revalidés côté serveur : ce contrôle sert
    // seulement à éviter un aller-retour réseau inutile.
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
      formData.set("email", isIdentified ? context.userEmail! : email);

      const resolvedName = isIdentified ? context.userName : name;
      if (resolvedName) formData.set("name", resolvedName);
      if (categoryId !== NONE) formData.set("categoryId", categoryId);
      if (context.sourceUrl) formData.set("sourceUrl", context.sourceUrl);
      if (context.userId) formData.set("papairisUserId", context.userId);
      if (context.appVersion) formData.set("papairisAppVersion", context.appVersion);
      if (context.papairisClientId) formData.set("papairisClientId", context.papairisClientId);
      if (form.slug) formData.set("sourceSlug", form.slug);
      // Même sac de valeurs pour les champs globaux et ceux de la source : les
      // clés sont uniques et atterrissent toutes dans `Ticket.metadata`.
      if (customFields.length || form.fields.length) {
        formData.set(
          "customFields",
          JSON.stringify({ ...customFieldValues, ...sourceFieldValues })
        );
      }
      attachments.forEach((attachment) => formData.append("attachments", attachment.file));

      const response = await fetch("/api/widget/tickets", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Une erreur est survenue.");
      }

      setTicketNumber(result.number);
      sendToParent(PAPAIRIS_TICKET_CREATED_MESSAGE_TYPE, { ticketNumber: result.number });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (ticketNumber !== null) {
    return (
      <WidgetSuccess
        ticketNumber={ticketNumber}
        message={form.successMessage}
        onClose={() => sendToParent(PAPAIRIS_CLOSE_MESSAGE_TYPE)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
      <div className="space-y-3">
        {form.logoUrl && (
          // <img> volontaire : le visuel peut venir d'une route API dynamique ou
          // d'une URL externe arbitraire, next/image n'apporte rien ici.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logoUrl} alt="" className="h-8 w-auto object-contain" />
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{form.formTitle}</h1>
          {form.formDescription && (
            <p className="text-sm text-muted-foreground">{form.formDescription}</p>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3.5 py-3 text-sm font-medium leading-snug text-foreground">
          {bannerMessage}
        </div>
      )}

      {isIdentified && (
        <div className="rounded-md border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
          Connecté en tant que{" "}
          <span className="font-medium text-foreground">
            {context.userName || context.userEmail}
          </span>
        </div>
      )}

      {!isIdentified && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-10"
            />
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
      )}

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

      {form.showCategoryField && (
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
          onChange={(value) =>
            setCustomFieldValues((prev) => ({ ...prev, [field.key]: value }))
          }
        />
      ))}

      {form.fields.map((field) => (
        <SourceFieldInput
          key={field.id}
          field={field}
          value={sourceFieldValues[field.key]}
          onChange={(value) =>
            setSourceFieldValues((prev) => ({ ...prev, [field.key]: value }))
          }
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
          className={
            isDraggingOver ? "rounded-md ring-2 ring-primary ring-offset-1" : "rounded-md"
          }
        >
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={handlePaste}
            required
            rows={5}
            placeholder={
              form.allowAttachments
                ? "Décrivez votre problème… (vous pouvez coller ou glisser une capture d'écran)"
                : "Décrivez votre problème…"
            }
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

      <Button type="submit" disabled={isSubmitting} className="mt-1 h-10 w-full text-sm">
        {isSubmitting ? "Envoi…" : form.submitLabel}
      </Button>
    </form>
  );
}
