"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  createCannedResponse,
  updateCannedResponse,
  type CannedResponseWithFilters,
} from "@/lib/actions/canned-responses";
import { CANNED_RESPONSE_VARIABLES } from "@/lib/canned-response-variables";
import type { FilterDimensionWithOptions } from "@/lib/canned-responses";
import type { CannedResponseDimension } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Valeurs cochées, par dimension. Une dimension absente ou vide = aucune restriction. */
type Selection = Partial<Record<CannedResponseDimension, string[]>>;

export function CannedResponseDialog({
  response,
  dimensions,
  trigger,
}: {
  response?: CannedResponseWithFilters;
  dimensions: FilterDimensionWithOptions[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Le formulaire est monté avec la fenêtre : chaque ouverture repart de la
          réponse enregistrée, sans état résiduel d'une édition abandonnée. */}
      <DialogContent className="sm:max-w-4xl">
        <CannedResponseForm
          response={response}
          dimensions={dimensions}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Deux colonnes, parce qu'il y a deux questions distinctes : ce que la réponse
 * DIT (titre, texte) et QUAND elle sort (filtres, pré-remplissage). Les empiler
 * donnait une colonne interminable où la rédaction et le ciblage se
 * ressemblaient ; côte à côte, chacun garde son bloc et la fenêtre tient sans
 * défilement sur un écran d'ordinateur portable.
 */
function CannedResponseForm({
  response,
  dimensions,
  onSaved,
}: {
  response?: CannedResponseWithFilters;
  dimensions: FilterDimensionWithOptions[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(response);

  const [title, setTitle] = useState(response?.title ?? "");
  const [body, setBody] = useState(response?.body ?? "");
  const [isActive, setIsActive] = useState(response?.isActive ?? true);
  const [autoInsert, setAutoInsert] = useState(response?.autoInsert ?? false);
  const [selection, setSelection] = useState<Selection>(() => toSelection(response));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const filters = toFilters(selection);

  function toggleValue(dimension: CannedResponseDimension, valueId: string) {
    setSelection((current) => {
      const values = current[dimension] ?? [];

      if (values.includes(valueId)) {
        return { ...current, [dimension]: values.filter((id) => id !== valueId) };
      }
      return { ...current, [dimension]: [...values, valueId] };
    });
  }

  /** Retour à « toutes les valeurs » sur une dimension : la pastille de gauche. */
  function clearDimension(dimension: CannedResponseDimension) {
    setSelection((current) => ({ ...current, [dimension]: [] }));
  }

  /**
   * Insère `{{variable}}` là où se trouve le curseur, et non en fin de texte :
   * on choisit une variable au moment où on en a besoin, au milieu d'une phrase.
   */
  function insertVariable(name: string) {
    const placeholder = `{{${name}}}`;
    const textarea = bodyRef.current;

    if (!textarea) {
      setBody((current) => current + placeholder);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody(body.slice(0, start) + placeholder + body.slice(end));

    // Le curseur se replace après la variable insérée, sur le prochain tour de
    // rendu : à cet instant, le champ contient encore l'ancien texte.
    const caret = start + placeholder.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const input = { title, body, isActive, autoInsert, filters };

      if (response) {
        await updateCannedResponse(response.id, input);
      } else {
        await createCannedResponse(input);
      }
      toast.success(isEditing ? "Réponse mise à jour" : "Réponse créée");
      onSaved();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {isEditing ? "Modifier la réponse prédéfinie" : "Nouvelle réponse prédéfinie"}
        </DialogTitle>
        <DialogDescription>
          Un texte réutilisable, proposé aux agents sur les tickets qu&apos;il concerne.
        </DialogDescription>
      </DialogHeader>

      {/* Les filets haut et bas courent sur toute la largeur de la fenêtre (d'où
          les marges négatives) : sans eux, le contenu défilant se glissait sous
          le titre, phrase coupée en deux, et rien ne disait qu'il y avait encore
          quelque chose à lire. */}
      <div className="-mx-4 max-h-[64dvh] overflow-y-auto border-y px-4 py-4">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <SectionTitle>Le message</SectionTitle>

            <div className="space-y-1.5">
              <Label htmlFor="canned-title">Titre</Label>
              <Input
                id="canned-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={120}
                placeholder="Demande de précisions"
              />
              <p className="text-xs text-muted-foreground">
                Nom interne, pour retrouver la réponse au moment de répondre. Le client ne le voit
                jamais.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="canned-body">Contenu</Label>
              <Textarea
                id="canned-body"
                ref={bodyRef}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={10000}
                rows={10}
                placeholder={"Bonjour {{client}},\n\nMerci pour votre message…"}
              />
              <VariablesRow onInsert={insertVariable} />
            </div>
          </section>

          {/* Le filet vertical ne s'affiche qu'à deux colonnes : empilés, les
              deux blocs sont déjà séparés par leurs intitulés. */}
          <section className="space-y-5 md:border-l md:pl-6">
            <FiltersField
              dimensions={dimensions}
              selection={selection}
              onToggleValue={toggleValue}
              onClearDimension={clearDimension}
            />

            <Separator />

            <div className="space-y-3">
              <SectionTitle>Comportement</SectionTitle>

              <ToggleRow
                id="canned-auto-insert"
                checked={autoInsert}
                onChange={setAutoInsert}
                label="Pré-remplir la réponse dès l'ouverture du ticket"
                hint="Le texte est déjà dans le champ de rédaction, à relire et à compléter. Rien ne part sans un clic sur Envoyer."
              >
                {autoInsert && filters.length === 0 && (
                  <p className="text-xs font-medium text-destructive">
                    Aucun filtre : elle se pré-remplira sur tous les tickets.
                  </p>
                )}
                {autoInsert && filters.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Si plusieurs réponses pré-remplies s&apos;appliquent, la plus ciblée
                    l&apos;emporte.
                  </p>
                )}
              </ToggleRow>

              <ToggleRow
                id="canned-active"
                checked={isActive}
                onChange={setIsActive}
                label="Réponse active"
                hint="Décochée, elle est conservée mais plus proposée aux agents."
              />
            </div>
          </section>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Intitulé de bloc — au-dessus des libellés de champs dans la hiérarchie. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * Un réglage à cocher : même gabarit pour tous, ce qui les rend comparables d'un
 * coup d'œil. Les deux étaient auparavant traités différemment — l'un encadré et
 * bavard, l'autre seul sur une ligne — et rien ne justifiait cet écart.
 */
function ToggleRow({
  id,
  checked,
  onChange,
  label,
  hint,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
  /** Avertissements affichés sous l'indice, selon l'état du formulaire. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm leading-snug font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Les filtres, une ligne par dimension du registre. Aucun critère n'est écrit
 * ici : ce composant affiche ce que le serveur lui donne, donc ajouter une
 * dimension au registre la fait apparaître sans toucher au formulaire.
 */
function FiltersField({
  dimensions,
  selection,
  onToggleValue,
  onClearDimension,
}: {
  dimensions: FilterDimensionWithOptions[];
  selection: Selection;
  onToggleValue: (dimension: CannedResponseDimension, valueId: string) => void;
  onClearDimension: (dimension: CannedResponseDimension) => void;
}) {
  if (dimensions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <SectionTitle>Quand la proposer</SectionTitle>
        <p className="text-xs text-muted-foreground">
          Ne restreignez que ce qui compte. Deux lignes restreintes se cumulent : la réponse ne
          sortira que sur les tickets qui réunissent les deux.
        </p>
      </div>

      {dimensions.map((dimension) => (
        <DimensionRow
          key={dimension.key}
          dimension={dimension}
          selectedIds={selection[dimension.key] ?? []}
          onToggleValue={onToggleValue}
          onClearDimension={onClearDimension}
        />
      ))}
    </div>
  );
}

/**
 * Une dimension et ses valeurs.
 *
 * « Toutes les sources » est une pastille comme les autres, sélectionnée quand
 * rien d'autre ne l'est, et non un indice gris posé à droite du titre : le cas
 * par défaut devient un choix visible et cliquable — c'est ainsi qu'on revient
 * en arrière — au lieu d'un texte qui apparaissait et disparaissait selon la
 * ligne, ce qui faisait sautiller la mise en page.
 */
function DimensionRow({
  dimension,
  selectedIds,
  onToggleValue,
  onClearDimension,
}: {
  dimension: FilterDimensionWithOptions;
  selectedIds: string[];
  onToggleValue: (dimension: CannedResponseDimension, valueId: string) => void;
  onClearDimension: (dimension: CannedResponseDimension) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{dimension.label}</p>

      <div className="flex flex-wrap gap-1.5">
        <ValueChip
          label={dimension.everyValueLabel}
          selected={selectedIds.length === 0}
          onSelect={() => onClearDimension(dimension.key)}
        />
        {dimension.options.map((option) => (
          <ValueChip
            key={option.id}
            label={option.name}
            selected={selectedIds.includes(option.id)}
            onSelect={() => onToggleValue(dimension.key, option.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ValueChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted/50",
        selected && "border-primary bg-primary/10 font-medium text-foreground hover:bg-primary/10",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Variables disponibles, sur une seule ligne de pastilles à insérer. La liste
 * vient de la même source que le remplissage (`CANNED_RESPONSE_VARIABLES`) : la
 * documentation affichée ne peut pas décrire une variable qui n'existe pas.
 *
 * Le détail de chacune passe en infobulle plutôt qu'en liste à puces : quatre
 * noms explicites n'ont pas besoin de quatre lignes de description sous le
 * champ, elles poussaient le reste du formulaire hors de l'écran.
 */
function VariablesRow({ onInsert }: { onInsert: (name: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Variables :</span>
        {CANNED_RESPONSE_VARIABLES.map((variable) => (
          <button
            key={variable.name}
            type="button"
            onClick={() => onInsert(variable.name)}
            title={variable.description}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground transition-colors hover:bg-muted/70"
          >
            {`{{${variable.name}}}`}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Cliquez pour insérer au curseur. Sans valeur sur le ticket, la variable reste visible dans
        le champ, à compléter à la main.
      </p>
    </div>
  );
}

/** Filtres enregistrés → pastilles sélectionnées. */
function toSelection(response: CannedResponseWithFilters | undefined): Selection {
  const selection: Selection = {};
  if (!response) {
    return selection;
  }

  for (const filter of response.filters) {
    const values = selection[filter.dimension] ?? [];
    selection[filter.dimension] = [...values, filter.valueId];
  }
  return selection;
}

/** Pastilles sélectionnées → filtres à enregistrer. */
function toFilters(selection: Selection) {
  const filters: { dimension: CannedResponseDimension; valueId: string }[] = [];

  for (const [dimension, valueIds] of Object.entries(selection)) {
    for (const valueId of valueIds ?? []) {
      filters.push({ dimension: dimension as CannedResponseDimension, valueId });
    }
  }
  return filters;
}
