"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Un attribut de ticket modifiable depuis la file, sans ouvrir la fiche.
 *
 * Le besoin : trier une file, c'est passer une priorité en urgent, rattacher un
 * produit et confier trois dossiers à trois collègues. Le faire fiche par fiche
 * imposait six navigations pour trois gestes de deux secondes.
 *
 * Trois partis pris, tous dictés par le fait que ça vit dans un tableau dense où
 * la ligne entière est cliquable :
 *
 * 1. **La valeur reste du texte tant qu'on ne la survole pas.** Un tableau où
 *    chaque cellule porte un contour de champ de saisie devient illisible. Le
 *    chevron et le fond n'apparaissent qu'au survol de la cellule.
 *
 * 2. **Le clic ne remonte pas à la ligne.** Sans `stopPropagation`, ouvrir le
 *    menu naviguerait vers la fiche du ticket — le geste qu'on essayait
 *    justement d'éviter.
 *
 * 3. **La valeur choisie s'affiche avant la réponse du serveur.** La file est
 *    rendue par le serveur : attendre l'aller-retour laisserait l'ancienne valeur
 *    à l'écran une demi-seconde, ce qui donne l'impression d'un clic perdu et
 *    fait recliquer. En cas d'échec, l'ancienne valeur revient avec l'erreur.
 */

/**
 * Jeton pour « aucune valeur ».
 *
 * Radix refuse une valeur vide sur un item de groupe radio (elle y signifie
 * « rien de sélectionné »), et `null` ne traverse pas son API de chaînes. D'où ce
 * jeton, converti dans les deux sens ici même — il ne sort jamais de ce fichier.
 */
const NONE = "__none__";

export type InlineOption = {
  /** `null` pour « aucun » (pas de produit, pas d'assigné). */
  value: string | null;
  label: string;
  /** Pastille de couleur, pour les valeurs qui en portent une dans les réglages. */
  color?: string;
};

export function InlineAttribute({
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
  renderValue,
  align = "start",
}: {
  /** Ce que le menu modifie, dit en entier pour un lecteur d'écran. */
  ariaLabel: string;
  value: string | null;
  options: InlineOption[];
  onChange: (next: string | null) => Promise<unknown>;
  /** Sans « tickets.respond », la cellule redevient du texte simple. */
  disabled?: boolean;
  /** Rendu de la valeur courante — celui de la colonne, pour ne rien changer à l'œil. */
  renderValue: (option: InlineOption | undefined) => React.ReactNode;
  align?: "start" | "end";
}) {
  const router = useRouter();
  /**
   * Valeur affichée par anticipation, ÉTIQUETÉE par la valeur serveur sur
   * laquelle elle a été posée.
   *
   * C'est cette étiquette qui rend l'anticipation autonettoyante : dès que le
   * serveur renvoie autre chose — parce qu'il a enregistré le changement, ou
   * parce qu'un collègue en a posé un autre entre-temps — l'étiquette ne
   * correspond plus et l'affichage repart de la donnée réelle. Sans elle, il
   * faudrait remettre l'état à zéro depuis un effet, c'est-à-dire rendre une
   * fois avec une valeur qu'on sait déjà périmée.
   */
  const [optimistic, setOptimistic] = useState<{
    basedOn: string | null;
    next: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const current = optimistic && optimistic.basedOn === value ? optimistic.next : value;
  const selected = options.find((option) => option.value === current);

  async function pick(next: string | null) {
    if (next === current) return;

    setOptimistic({ basedOn: value, next });
    setSaving(true);
    try {
      await onChange(next);
      router.refresh();
    } catch (error) {
      setOptimistic(null);
      toast.error(error instanceof Error ? error.message : "Modification impossible");
    } finally {
      setSaving(false);
    }
  }

  if (disabled) {
    return <>{renderValue(selected)}</>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          // Le menu s'ouvre au clic, la ligne ne s'ouvre pas : les deux gestes
          // partagent le même pixel, seul l'arrêt de la propagation les sépare.
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-1 rounded px-1.5 py-1 text-left",
            "transition-colors hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            "data-[state=open]:bg-background data-[state=open]:ring-[3px] data-[state=open]:ring-ring/50",
            saving && "opacity-60",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{renderValue(selected)}</span>
          {saving ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60"
            />
          )}
        </button>
      </DropdownMenuTrigger>

      {/* `RadioGroup` et non une liste d'items : la valeur courante doit se voir
          dans le menu, sinon on ne sait pas ce qu'on est en train de changer. */}
      <DropdownMenuContent align={align} className="max-h-72 w-52 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={current ?? NONE}
          onValueChange={(next) => pick(next === NONE ? null : next)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value ?? NONE}
              value={option.value ?? NONE}
              className="gap-2"
            >
              {option.color && (
                <span
                  aria-hidden
                  style={{ backgroundColor: option.color }}
                  className="size-1.5 shrink-0 rounded-full"
                />
              )}
              <span className="truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
