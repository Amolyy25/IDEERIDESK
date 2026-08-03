"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteKnowledgeArticle } from "@/lib/actions/knowledge-base";
import type { KnowledgeArticleListItem } from "@/lib/actions/knowledge-base";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = "__all__";
type StatusFilter = "ALL" | "DRAFT" | "PUBLISHED";

export function ArticlesTable({ articles }: { articles: KnowledgeArticleListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const article of articles) {
      if (article.category) seen.set(article.category.id, article.category.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [articles]);

  const filtered = articles.filter((article) => {
    if (status !== "ALL" && article.status !== status) return false;
    if (categoryId !== ALL_CATEGORIES && article.categoryId !== categoryId) return false;
    if (search.trim() && !article.title.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  async function handleDelete(id: string) {
    try {
      await deleteKnowledgeArticle(id);
      toast.success("Article supprimé");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucun article pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentez une première réponse récurrente pour la retrouver rapidement.
          </p>
        </div>
        <Button size="sm" asChild className="mt-1">
          <Link href="/knowledge-base/new">
            <Plus className="h-4 w-4" />
            Nouvel article
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article…"
            className="pl-8"
          />
        </div>

        {categories.length > 0 && (
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Toutes les catégories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="inline-flex rounded-md border p-0.5">
          {([
            ["ALL", "Tous"],
            ["PUBLISHED", "Publiés"],
            ["DRAFT", "Brouillons"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
                status === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Button size="sm" asChild className="ml-auto">
          <Link href="/knowledge-base/new">
            <Plus className="h-4 w-4" />
            Nouvel article
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Aucun article ne correspond à ces filtres.
        </p>
      ) : (
        <div className="rounded-lg border">
          {filtered.map((article, index) => (
            <div
              key={article.id}
              className={cn(
                "group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40",
                index > 0 && "border-t"
              )}
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/knowledge-base/${article.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {article.title}
                </Link>
                {article.excerpt && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {article.excerpt}
                  </p>
                )}
              </div>

              {article.category && (
                <Badge variant="outline" className="shrink-0">
                  {article.category.name}
                </Badge>
              )}

              <Badge
                variant={article.status === "PUBLISHED" ? "default" : "secondary"}
                className="shrink-0"
              >
                {article.status === "PUBLISHED" ? "Publié" : "Brouillon"}
              </Badge>

              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatDateTime(article.updatedAt)}
              </span>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cet article ?</AlertDialogTitle>
                    <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(article.id)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
