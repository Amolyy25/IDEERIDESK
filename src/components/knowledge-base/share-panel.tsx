"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Share2, Check, Copy, Link2Off, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  generateArticleShareLink,
  revokeArticleShareLink,
  updateArticleShareSlug,
} from "@/lib/actions/knowledge-base";
import type { KnowledgeShareScope } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

export function SharePanel({
  articleId,
  shareToken,
  shareScope,
}: {
  /** `null` tant que l'article n'a pas été enregistré une première fois — le partage a besoin d'un id en base. */
  articleId: string | null;
  shareToken: string | null;
  shareScope: KnowledgeShareScope | null;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);
  // État local mis à jour immédiatement après chaque action, plutôt que
  // d'attendre le prochain rendu serveur — le panneau reflète le résultat
  // tout de suite, `router.refresh()` ne fait que resynchroniser en fond.
  const [localToken, setLocalToken] = useState(shareToken);
  const [localScope, setLocalScope] = useState(shareScope);
  const [slugInput, setSlugInput] = useState(shareToken ?? "");

  const isShared = Boolean(localToken && localScope);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = localToken ? `${origin}/kb/${localToken}` : "";

  async function handleEnable(scope: KnowledgeShareScope) {
    if (!articleId) return;
    setIsPending(true);
    try {
      const result = await generateArticleShareLink(articleId, scope);
      setLocalToken(result.shareToken);
      setLocalScope(scope);
      setSlugInput(result.shareToken);
      router.refresh();
      toast.success("Lien de partage activé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'activer le partage");
    } finally {
      setIsPending(false);
    }
  }

  async function handleScopeChange(scope: KnowledgeShareScope) {
    if (!articleId || scope === localScope) return;
    setIsPending(true);
    try {
      await generateArticleShareLink(articleId, scope);
      setLocalScope(scope);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSlugSave() {
    if (!articleId || slugInput === localToken) return;
    setIsPending(true);
    try {
      const result = await updateArticleShareSlug(articleId, slugInput);
      setLocalToken(result.shareToken);
      setSlugInput(result.shareToken);
      router.refresh();
      toast.success("Lien mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lien invalide ou déjà utilisé");
      setSlugInput(localToken ?? "");
    } finally {
      setIsPending(false);
    }
  }

  async function handleRevoke() {
    if (!articleId) return;
    setIsPending(true);
    try {
      await revokeArticleShareLink(articleId);
      setLocalToken(null);
      setLocalScope(null);
      setSlugInput("");
      router.refresh();
      toast.success("Lien de partage désactivé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de désactiver le partage");
    } finally {
      setIsPending(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2">
      <Label>Partage</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={isShared ? "outline" : "default"}
            size="sm"
            className="w-full justify-start"
            disabled={!articleId}
            title={!articleId ? "Enregistrez d'abord l'article" : undefined}
          >
            <Share2 className="size-4" />
            {isShared ? "Lien de partage actif" : "Partager cet article"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          {!articleId ? (
            <p className="text-xs text-muted-foreground">
              Enregistrez d&apos;abord l&apos;article pour activer le partage.
            </p>
          ) : !isShared ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Qui peut voir ce lien ?</p>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => handleEnable("PUBLIC")}
                >
                  Public
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => handleEnable("INTERNAL")}
                >
                  Interne
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Public : consultable sans connexion. Interne : réservé aux agents connectés.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Adresse du lien</p>
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-xs text-muted-foreground">{origin}/kb/</span>
                  <Input
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    onBlur={handleSlugSave}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="h-7 flex-1 text-xs"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleCopy}
                  title="Copier le lien"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Ouvrir la page"
                  asChild
                >
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
                <div className="flex flex-1 rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleScopeChange("PUBLIC")}
                    disabled={isPending}
                    className={cn(
                      "flex-1 rounded px-2 py-1 transition-colors",
                      localScope === "PUBLIC"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScopeChange("INTERNAL")}
                    disabled={isPending}
                    className={cn(
                      "flex-1 rounded px-2 py-1 transition-colors",
                      localScope === "INTERNAL"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Interne
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleRevoke}
                  disabled={isPending}
                  title="Désactiver le partage"
                >
                  <Link2Off className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
