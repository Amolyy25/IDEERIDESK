"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { clearBrandLogo, setBrandLogo, type BrandLogoStatus } from "@/lib/actions/brand-logo";

/**
 * Logo repris en en-tête des emails sortants.
 *
 * Un aperçu, un bouton pour remplacer, un pour revenir au logo livré avec
 * l'application. Pas de champ d'URL : une adresse saisie à la main pointerait
 * tôt ou tard vers un fichier déplacé, et l'image casserait chez tous les
 * destinataires sans que personne ne le voie depuis le back-office.
 */
export function BrandLogoForm({ status }: { status: BrandLogoStatus }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    try {
      // Même trajet que les images de modèles : contrôle du format et de la
      // taille côté serveur, rangement en visuel public.
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/signatures/images", {
        method: "POST",
        body: formData,
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Envoi du logo impossible");
      }

      await setBrandLogo({ assetId: body.id });
      toast.success("Logo mis à jour");
      router.refresh();
    } catch (error) {
      let message = "Envoi du logo impossible";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleClear() {
    setIsClearing(true);
    try {
      await clearBrandLogo();
      toast.success("Logo par défaut rétabli");
      router.refresh();
    } catch (error) {
      let message = "Suppression impossible";
      if (error instanceof Error) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="max-w-xl space-y-3">
      <div className="space-y-1">
        <Label>Logo des emails</Label>
        <p className="text-xs text-muted-foreground">
          Repris en en-tête de tous les emails envoyés aux clients, et proposé par le bouton
          « Insérer le logo » des éditeurs de modèles.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-md border bg-muted/30 p-2">
          {/* `unoptimized` : le visuel est servi par notre propre route, déjà
              borné en taille au téléversement. Le passer à l'optimiseur
              n'apporterait rien et exigerait de déclarer le domaine. */}
          <Image
            src={status.url}
            alt="Logo utilisé dans les emails"
            width={120}
            height={56}
            unoptimized
            className="max-h-full w-auto object-contain"
          />

        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {status.isCustom
              ? "Logo personnalisé."
              : "Logo livré avec l'application."}{" "}
            PNG, JPEG, WEBP ou GIF, 1 Mo maximum.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <ImagePlus />
              {isUploading ? "Envoi…" : "Remplacer"}
            </Button>

            {status.isCustom && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={isClearing}
              >
                <Trash2 />
                {isClearing ? "Suppression…" : "Rétablir celui par défaut"}
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={handleFileSelected}
        />
      </div>
    </div>
  );
}
