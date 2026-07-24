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
import { CustomFieldInput } from "@/components/tickets/ticket-detail/custom-field-input";
import { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachment-rules";
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
  categories,
  customFields,
  initialContext,
  bannerMessage,
}: {
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) addFiles(files);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
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
      if (customFields.length) formData.set("customFields", JSON.stringify(customFieldValues));
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
        onClose={() => sendToParent(PAPAIRIS_CLOSE_MESSAGE_TYPE)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Contacter le support</h1>
        <p className="text-sm text-muted-foreground">
          Décrivez votre problème, nous vous répondrons rapidement.
        </p>
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

          {attachments.length < MAX_ATTACHMENTS && (
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
        {isSubmitting ? "Envoi…" : "Envoyer"}
      </Button>
    </form>
  );
}
