"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Editor, getHTMLFromFragment, posToDOMRect } from "@tiptap/core";
import { Check, ChevronDown, Loader2, SpellCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_REWRITE_INSTRUCTION_CHARS,
  REWRITE_INTENTS,
  type RewriteIntentId,
} from "@/lib/ai-rewrite";

/**
 * La barre qui apparaît au-dessus d'un texte sélectionné dans un article.
 *
 * Elle répond à un geste précis : on RELIT, on tombe sur un paragraphe bancal,
 * on le sélectionne. À cet instant l'intention est déjà formée, et le seul
 * service utile est de l'appliquer en un clic, là où les yeux sont déjà — pas
 * dans une barre d'outils en haut de page, encore moins dans une fenêtre.
 *
 * Les deux gestes les plus fréquents sont directement sur la barre ; les cinq
 * autres et la consigne libre vivent derrière le chevron. Le catalogue est le
 * MÊME que celui de la zone de réponse d'un ticket (`ai-rewrite.ts`) : un agent
 * qui connaît « Simplifier » sur un message le retrouve à l'identique sur un
 * article.
 *
 * Positionnement à la main plutôt qu'avec la barre flottante de Tiptap : son
 * paquet n'est pas installé, et `posToDOMRect` suffit — la barre est placée
 * dans le repère de l'éditeur, donc elle suit le texte quand la page défile.
 */

/** Ce qui reste sur la barre : le reste passe dans le menu. */
const PRIMARY_INTENTS: RewriteIntentId[] = ["improve", "correct"];

/** Demi-largeur estimée de la barre, pour ne pas la laisser sortir du cadre. */
const HALF_WIDTH = 130;

/** Place disponible au-dessus de la sélection, sinon la barre passe dessous. */
const MIN_SPACE_ABOVE = 48;

type Anchor = { top: number; left: number; below: boolean };

export function AiSelectionMenu({
  editor,
  containerRef,
}: {
  editor: Editor;
  /** Le cadre de l'éditeur, repère de positionnement (il porte `relative`). */
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [customValue, setCustomValue] = useState<string | null>(null);

  /**
   * Ce qui empêche la barre de disparaître quand l'éditeur perd le focus.
   * Sans lui, ouvrir le menu ou le champ de consigne — deux gestes qui sortent
   * du texte — refermerait la barre à l'instant précis où on s'en sert.
   *
   * Posé DANS les gestionnaires, pas dans un effet : ouvrir le menu déplace le
   * focus tout de suite (Radix le capture), donc avant qu'un effet ait pu
   * s'exécuter. Un drapeau en retard d'un rendu, ici, c'est une barre qui
   * disparaît une fois sur deux.
   */
  const keepOpenRef = useRef(false);

  function toggleMenu(open: boolean) {
    keepOpenRef.current = open;
    setIsMenuOpen(open);
  }

  function editCustom(value: string | null) {
    keepOpenRef.current = value !== null;
    setCustomValue(value);
  }

  const updateAnchor = useCallback(() => {
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    const container = containerRef.current;
    if (empty || !container) {
      if (!keepOpenRef.current) setAnchor(null);
      return;
    }

    const selectionRect = posToDOMRect(view, from, to);
    const box = container.getBoundingClientRect();
    const below = selectionRect.top - box.top < MIN_SPACE_ABOVE;

    setAnchor({
      top: below ? selectionRect.bottom - box.top + 8 : selectionRect.top - box.top - 8,
      // Bornée aux deux extrémités : une sélection en bout de ligne laissait
      // sinon la moitié de la barre hors du cadre.
      left: Math.min(
        Math.max(selectionRect.left - box.left + selectionRect.width / 2, HALF_WIDTH),
        Math.max(box.width - HALF_WIDTH, HALF_WIDTH)
      ),
      below,
    });
  }, [editor, containerRef]);

  useEffect(() => {
    const onBlur = () => {
      if (!keepOpenRef.current) setAnchor(null);
    };
    editor.on("selectionUpdate", updateAnchor);
    editor.on("blur", onBlur);
    return () => {
      editor.off("selectionUpdate", updateAnchor);
      editor.off("blur", onBlur);
    };
  }, [editor, updateAnchor]);

  async function runIntent(intent: RewriteIntentId, instruction?: string) {
    const { from, to } = editor.state.selection;
    if (from === to || isRewriting) return;

    // Une sélection qui ne sort pas de son bloc est rendue SANS balise de
    // paragraphe : le remplacement doit alors rester en ligne, sinon reformuler
    // trois mots couperait la phrase en deux paragraphes.
    const inline = editor.state.selection.$from.sameParent(editor.state.selection.$to);
    const text = getHTMLFromFragment(editor.state.doc.slice(from, to).content, editor.schema);

    keepOpenRef.current = true;
    setIsRewriting(true);
    try {
      const response = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          format: inline ? "inline" : "html",
          intent,
          instruction,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Réécriture impossible");
      }

      // Le texte a-t-il bougé pendant l'appel ? Les positions retenues plus haut
      // ne désigneraient plus le même passage, et l'insertion écraserait la
      // mauvaise phrase. On préfère ne rien faire et le dire.
      const current = editor.state.selection;
      if (current.from !== from || current.to !== to) {
        toast.error("Le texte a changé pendant la réécriture — rien n'a été remplacé.");
        return;
      }

      editor.chain().focus().insertContentAt({ from, to }, body.result).run();
      editCustom(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Réécriture impossible");
    } finally {
      keepOpenRef.current = false;
      setIsRewriting(false);
    }
  }

  if (!anchor) return null;

  const primary = PRIMARY_INTENTS.map((id) => REWRITE_INTENTS.find((i) => i.id === id)!);
  const secondary = REWRITE_INTENTS.filter(
    (intent) => intent.id !== "custom" && !PRIMARY_INTENTS.includes(intent.id)
  );

  return (
    <div
      className="absolute z-30 rounded-lg border bg-popover p-1 shadow-md"
      style={{
        top: anchor.top,
        left: anchor.left,
        transform: anchor.below ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
      // Le clic ne doit pas retirer le focus de l'éditeur : sans ça, la
      // sélection s'efface et il n'y a plus rien à réécrire au moment où la
      // requête part.
      onMouseDown={(event) => event.preventDefault()}
    >
      {isRewriting ? (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Réécriture…
        </div>
      ) : customValue !== null ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={customValue}
            onChange={(event) => editCustom(event.target.value)}
            maxLength={MAX_REWRITE_INSTRUCTION_CHARS}
            placeholder="Que faut-il en faire ?"
            className="h-7 w-56 text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (customValue.trim()) void runIntent("custom", customValue.trim());
              }
              if (event.key === "Escape") {
                event.preventDefault();
                editCustom(null);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            disabled={!customValue.trim()}
            onClick={() => void runIntent("custom", customValue.trim())}
            aria-label="Appliquer la consigne"
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            onClick={() => editCustom(null)}
            aria-label="Annuler"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          {primary.map((intent) => (
            <Button
              key={intent.id}
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              title={intent.hint}
              onClick={() => void runIntent(intent.id)}
            >
              {intent.id === "correct" ? (
                <SpellCheck className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {intent.short}
            </Button>
          ))}

          <DropdownMenu open={isMenuOpen} onOpenChange={toggleMenu}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-7 p-0"
                aria-label="Autres reformulations"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              {secondary.map((intent) => (
                <DropdownMenuItem
                  key={intent.id}
                  className="items-start gap-2 py-1.5"
                  onSelect={() => void runIntent(intent.id)}
                >
                  <span className="space-y-0.5">
                    <span className="block text-sm">{intent.label}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {intent.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editCustom("")}>
                Autre consigne…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
