"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import { SharePanel } from "@/components/knowledge-base/share-panel";
import { createKnowledgeArticle, updateKnowledgeArticle } from "@/lib/actions/knowledge-base";
import type { KnowledgeArticleListItem } from "@/lib/actions/knowledge-base";
import type {
  ArticleTemplate,
  KnowledgeArticleStatus,
  KnowledgeCategory,
} from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const NONE = "__none__";

async function uploadArticleImage(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/knowledge-base/images", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Envoi de l'image impossible");
  }
  const body = await response.json();
  return body.url as string;
}

export function ArticleForm({
  article,
  categories,
  templates,
  allArticles,
}: {
  article?: KnowledgeArticleListItem;
  categories: KnowledgeCategory[];
  templates: ArticleTemplate[];
  allArticles: KnowledgeArticleListItem[];
}) {
  const router = useRouter();
  const isEditing = Boolean(article);

  const [title, setTitle] = useState(article?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [status, setStatus] = useState<KnowledgeArticleStatus>(article?.status ?? "DRAFT");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? NONE);
  const [templateId, setTemplateId] = useState(NONE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    if (content && !window.confirm("Remplacer le contenu actuel par ce modèle ?")) return;
    setContent(template.content);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const input = {
        title,
        excerpt: excerpt || null,
        content,
        status,
        categoryId: categoryId === NONE ? null : categoryId,
      };

      if (article) {
        await updateKnowledgeArticle(article.id, input);
      } else {
        await createKnowledgeArticle(input);
      }
      toast.success(isEditing ? "Article mis à jour" : "Article créé");
      router.push("/knowledge-base");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/knowledge-base"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Articles
        </Link>
        <Button type="submit" disabled={isSubmitting} size="sm">
          {isSubmitting ? "Enregistrement…" : isEditing ? "Enregistrer" : "Créer l'article"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Titre de l'article"
            className="h-auto border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />

          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Décrivez la solution étape par étape…"
            minHeight="420px"
            internalLinkTargets={allArticles
              .filter((a) => a.id !== article?.id)
              .map((a) => ({ id: a.id, title: a.title, slug: a.slug }))}
            onUploadImage={uploadArticleImage}
          />

          <HtmlPolicyHint profile="article" />
        </div>

        <div className="space-y-5 lg:border-l lg:pl-6">
          <div className="space-y-2">
            <Label>Statut</Label>
            <div className="inline-flex w-full rounded-md border p-0.5">
              {(["DRAFT", "PUBLISHED"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    "flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
                    status === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {value === "DRAFT" ? "Brouillon" : "Publié"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {status === "PUBLISHED"
                ? "Visible dans le widget et l'assistant IA."
                : "Visible uniquement par l'équipe."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>Partir d&apos;un modèle</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Aucun modèle sélectionné" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="excerpt">Résumé</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Affiché dans les listes et suggestions."
            />
          </div>

          <SharePanel
            articleId={article?.id ?? null}
            shareToken={article?.shareToken ?? null}
            shareScope={article?.shareScope ?? null}
          />
        </div>
      </div>
    </form>
  );
}
