"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATS_RANGE_PRESETS, type StatsRangeKey } from "@/lib/stats-range";

const ALL = "__all__";

/**
 * La barre de période : UNE seule, au-dessus de tout ce qu'elle règle.
 *
 * Toute la page se lit contre la même tranche de temps. Un sélecteur par carte
 * aurait produit des chiffres qu'on croit comparables et qui ne le sont pas —
 * « 42 tickets » et « 3 en attente » n'ont aucun sens côte à côte s'ils portent
 * sur deux plages différentes.
 *
 * L'état vit dans l'URL et nulle part ailleurs : la page est rendue côté serveur
 * contre ces paramètres, et une période se partage alors par simple copie du lien
 * (« regarde le mois dernier sur Papairis »).
 */
export function StatsToolbar({
  activeRange,
  products,
}: {
  activeRange: StatsRangeKey;
  products: { id: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function selectPreset(key: StatsRangeKey) {
    pushParams((params) => {
      params.set("range", key);
      // Les bornes manuelles tombent avec le préréglage : les garder ferait
      // afficher « 7 derniers jours » au-dessus d'une période personnalisée, les
      // deux dates l'emportant à la résolution.
      params.delete("from");
      params.delete("to");
    });
  }

  function setBound(key: "from" | "to", value: string) {
    pushParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);

      // Saisir une borne, c'est demander une période personnalisée — même une
      // seule : « depuis le 1er janvier » est une demande complète, l'autre borne
      // étant alors aujourd'hui. Le préréglage cesse d'être vrai et son bouton se
      // désélectionne. Les deux bornes effacées, on revient au préréglage par
      // défaut plutôt qu'à une période vide.
      if (params.get("from") || params.get("to")) params.set("range", "custom");
      else params.delete("range");
    });
  }

  const hasFilters = Boolean(
    searchParams.get("range") || from || to || categoryId,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border bg-card px-3 py-2.5 shadow-xs">
      {/* Préréglages en premier : c'est ce qu'on veut dans neuf cas sur dix, et
          les bornes manuelles ne servent qu'au dixième. */}
      <div className="flex flex-wrap items-center gap-1">
        {STATS_RANGE_PRESETS.map((preset) => {
          const active = activeRange === preset.key;
          return (
            <Button
              key={preset.key}
              size="sm"
              variant={active ? "default" : "ghost"}
              aria-pressed={active}
              onClick={() => selectPreset(preset.key)}
              className="h-8"
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />

      {/* Bornes natives, comme le journal d'audit : le sélecteur du navigateur
          fait ce travail sans dépendance. */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="stats-from" className="text-xs text-muted-foreground">
          Du
        </label>
        <Input
          id="stats-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setBound("from", event.target.value)}
          className={cn("h-8 w-[9.5rem] bg-card", from && "border-primary/50")}
        />
        <label htmlFor="stats-to" className="text-xs text-muted-foreground">
          au
        </label>
        <Input
          id="stats-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setBound("to", event.target.value)}
          className={cn("h-8 w-[9.5rem] bg-card", to && "border-primary/50")}
        />
      </div>

      <Select
        value={categoryId || ALL}
        onValueChange={(value) =>
          pushParams((params) => {
            if (!value || value === ALL) params.delete("categoryId");
            else params.set("categoryId", value);
          })
        }
      >
        <SelectTrigger
          className={cn("h-8 w-48 bg-card", categoryId && "border-primary/50 text-foreground")}
        >
          <SelectValue placeholder="Produit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les produits</SelectItem>
          {products.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              <span className="flex items-center gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: product.color }}
                  aria-hidden
                />
                {product.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="h-8 text-muted-foreground"
        >
          <X className="size-4" />
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
