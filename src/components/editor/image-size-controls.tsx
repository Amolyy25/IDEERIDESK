"use client";

import type { Editor } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import {
  IMAGE_WIDTH_PRESETS,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
  clampImageWidth,
} from "@/components/editor/resizable-image-extension";
import { cn } from "@/lib/utils";

/**
 * Barre de taille affichée sous la barre d'outils quand une image est
 * sélectionnée.
 *
 * Double emploi avec la poignée de glissement, volontairement : la poignée est
 * ce qu'on cherche instinctivement, les valeurs exactes sont ce dont on a besoin
 * pour aligner deux signatures au pixel près.
 */
export function ImageSizeControls({ editor }: { editor: Editor }) {
  const currentWidth: number | null = editor.getAttributes("image").width ?? null;

  function applyWidth(width: number | null) {
    // `height` remise à zéro en même temps : celle laissée par un
    // redimensionnement à la souris ne correspond plus à la nouvelle largeur, et
    // l'image partirait écrasée. Sans hauteur, tous les clients mail la mettent
    // à l'échelle en gardant ses proportions.
    editor.chain().focus().updateAttributes("image", { width, height: null }).run();
  }

  function commitTypedWidth(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      applyWidth(null);
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      // Saisie inexploitable : on ne touche à rien, le champ retrouve la valeur
      // en cours au prochain rendu.
      applyWidth(currentWidth);
      return;
    }
    applyWidth(clampImageWidth(parsed));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-xs">
      <span className="font-medium text-muted-foreground">Taille de l&apos;image</span>

      <div className="flex items-center gap-0.5">
        {IMAGE_WIDTH_PRESETS.map((preset) => (
          <button
            key={preset.width}
            type="button"
            onClick={() => applyWidth(preset.width)}
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors hover:bg-muted",
              currentWidth === preset.width && "bg-muted font-medium text-foreground"
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => applyWidth(null)}
          className={cn(
            "rounded px-1.5 py-0.5 transition-colors hover:bg-muted",
            currentWidth === null && "bg-muted font-medium text-foreground"
          )}
        >
          Originale
        </button>
      </div>

      <div className="flex items-center gap-1">
        {/* `key` sur la largeur en cours : le champ se réinitialise quand elle
            change ailleurs (poignée, bouton de taille), sans quoi il resterait
            figé sur ce qui a été tapé. */}
        <Input
          key={currentWidth ?? "auto"}
          defaultValue={currentWidth ?? ""}
          type="number"
          min={MIN_IMAGE_WIDTH}
          max={MAX_IMAGE_WIDTH}
          placeholder="auto"
          aria-label="Largeur de l'image en pixels"
          className="h-6 w-20 text-xs"
          onBlur={(event) => commitTypedWidth(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTypedWidth(event.currentTarget.value);
            }
          }}
        />
        <span className="text-muted-foreground">px</span>
      </div>

      <span className="text-muted-foreground">
        Glissez le coin bas-droit de l&apos;image pour l&apos;ajuster à la main.
      </span>
    </div>
  );
}
