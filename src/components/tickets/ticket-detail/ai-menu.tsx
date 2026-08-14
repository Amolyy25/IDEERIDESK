"use client";

import { useState } from "react";
import { ChevronDown, CornerDownLeft, Loader2, PenLine, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, type ModifierKey } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  MAX_REWRITE_INSTRUCTION_CHARS,
  REWRITE_INTENTS,
  type RewriteIntentId,
} from "@/lib/ai-rewrite";

/**
 * L'assistant : une action au clic, le choix juste à côté.
 *
 * Le bouton SUIT L'ÉTAT DU CHAMP, parce que ce dont on a besoin de l'IA n'est
 * pas le même selon qu'on a écrit ou non. Champ vide : il n'y a rien à
 * reprendre, le seul service utile est un brouillon. Champ rempli : ce qui
 * manque est une relecture.
 *
 * Dans ce second cas le bouton est SÉPARÉ EN DEUX, et c'est le cœur de son
 * ergonomie : la partie gauche applique tout de suite l'intention en cours — son
 * libellé le dit, et c'est exactement ce que fait la touche Tab — pendant que le
 * chevron ouvre la liste des autres. Un seul bouton qui n'aurait fait qu'ouvrir
 * un menu aurait coûté deux gestes à l'action qu'on répète cinquante fois par
 * jour ; à l'inverse, un bouton sans chevron aurait enfermé l'agent dans une
 * seule façon de faire.
 *
 * La liste est une palette de commandes et non un menu : on y descend aux
 * flèches, on valide à Entrée, et surtout on peut TAPER SA PROPRE CONSIGNE dans
 * le même champ que celui qui filtre les intentions. Elle n'est plus le passage
 * obligé — seulement le recours quand aucune des sept intentions ne convient.
 */
export function AiMenu({
  hasText,
  canSuggest,
  isSuggesting,
  isRewriting,
  disabled,
  activeIntent,
  modifier,
  open,
  onOpenChange,
  onSuggest,
  onRewrite,
}: {
  /** Y a-t-il quelque chose à reprendre ? C'est ce qui change le bouton. */
  hasText: boolean;
  /**
   * Faux sur une note interne : une réponse écrite de zéro s'adresse à un
   * client, et n'a rien à faire dans une note d'équipe. Reprendre ce qui est
   * écrit, en revanche, vaut pour les deux.
   */
  canSuggest: boolean;
  isSuggesting: boolean;
  isRewriting: boolean;
  /** Message déjà parti, ou envoi en cours : l'assistant n'a plus la main. */
  disabled: boolean;
  /** L'intention que rejoue la touche Tab, signalée dans la liste. */
  activeIntent: RewriteIntentId;
  modifier: ModifierKey;
  /**
   * Ouverture pilotée par la zone de rédaction : c'est elle qui reçoit la touche
   * Tab, et donc elle qui sait qu'on la maintient enfoncée pour choisir.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuggest: () => void;
  onRewrite: (intent: RewriteIntentId, instruction?: string) => void;
}) {
  // Ce qui est tapé dans la palette : à la fois le filtre des intentions et la
  // consigne libre. Jamais remis à zéro après usage — on ajuste rarement du
  // premier coup (« plus court », puis « plus court, vraiment »), et retaper sa
  // consigne de mémoire à chaque essai fait renoncer au deuxième.
  const [query, setQuery] = useState("");

  const isBusy = isSuggesting || isRewriting;
  const presets = REWRITE_INTENTS.filter((intent) => intent.id !== "custom");
  const matching = presets.filter(
    (intent) => matches(intent.label, query) || matches(intent.hint, query)
  );
  const custom = query.trim();
  // La commande qui repart de zéro reste atteignable pendant la frappe : elle se
  // filtre comme les autres, au lieu de disparaître dès qu'une consigne libre
  // est en cours d'écriture.
  const showSuggest =
    canSuggest && matches("Proposer une réponse complète brouillon suggérer", custom);

  /** La palette se referme d'abord : le champ doit être visible pendant l'attente. */
  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  // Champ vide : le bouton fait la seule chose utile, sans passer par la liste.
  // Un menu qui ne contiendrait qu'une commande n'est pas un menu.
  if (!hasText) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || isBusy}
        onClick={onSuggest}
        title={`Faire écrire un brouillon par l'IA (${modifier ?? "⌘ / Ctrl"} + O)`}
      >
        {isSuggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {isSuggesting ? "Rédaction…" : "Suggérer"}
        {!isSuggesting && modifier && <Kbd data-icon="inline-end">{modifier} O</Kbd>}
      </Button>
    );
  }

  const active = REWRITE_INTENTS.find((intent) => intent.id === activeIntent);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Les deux moitiés sont deux boutons distincts, séparés d'un filet : le
          survol éclaire celle qu'on vise, et le clavier les atteint l'une après
          l'autre. Un seul bouton avec deux zones cliquables aurait été
          indistinguable au survol comme à la tabulation. */}
      <div className="inline-flex items-center rounded-lg">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || isBusy}
          onClick={() => onRewrite(activeIntent)}
          className="rounded-r-none pr-2"
          title={`${active?.hint ?? ""} (Tab)`}
        >
          {isBusy ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {/* Le libellé est l'intention en cours, pas un verbe générique : c'est
              la seule façon de savoir, sans rien ouvrir, ce que fera Tab. */}
          {isRewriting ? "Réécriture…" : isSuggesting ? "Rédaction…" : (active?.short ?? "Améliorer")}
          {!isBusy && <Kbd data-icon="inline-end">Tab</Kbd>}
        </Button>

        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled || isBusy}
            className="rounded-l-none border-l border-border/70"
            title="Choisir une autre reprise — ou maintenir Tab"
            aria-label="Choisir une autre reprise du message"
          >
            <ChevronDown />
          </Button>
        </PopoverTrigger>
      </div>

      {/* `gap-0` : le contenu par défaut d'un `PopoverContent` est espacé, ce
          qui décollerait le pied de page de son propre filet. */}
      <PopoverContent align="end" className="w-88 gap-0 overflow-hidden p-0">
        <Command shouldFilter={false} loop>
          {/* Ce que le raccourci fera la prochaine fois, dit à l'endroit où on
              vient le changer : choisir ici, c'est aussi rearmer Tab. */}
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            La touche <span className="font-medium text-foreground">Tab</span> applique «{" "}
            {active?.label ?? "Améliorer le message"} ». Maintenez-la pour revenir à cette
            liste.
          </p>

          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Corriger, raccourcir… ou dites-lui quoi faire"
            maxLength={MAX_REWRITE_INSTRUCTION_CHARS}
          />

          <CommandList>
            {/* La consigne libre passe DEVANT la liste dès qu'on écrit : à cet
                instant, ce qui est tapé est la commande, pas un filtre. */}
            {custom && (
              <CommandGroup heading="Votre consigne">
                <CommandItem
                  value="__custom__"
                  onSelect={() => run(() => onRewrite("custom", custom))}
                >
                  <PenLine />
                  <span className="min-w-0 flex-1 truncate">« {custom} »</span>
                  <CommandShortcut>
                    <CornerDownLeft className="size-3.5" />
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}

            {matching.length > 0 && (
              <CommandGroup heading="Reprendre ce qui est écrit">
                {matching.map((intent) => (
                  <CommandItem
                    key={intent.id}
                    value={intent.id}
                    onSelect={() => run(() => onRewrite(intent.id))}
                  >
                    <Wand2 />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{intent.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {intent.hint}
                      </span>
                    </span>
                    {/* Sur la seule intention active : c'est ainsi que le
                        raccourci s'apprend, et qu'on sait ce qu'il rejouera. */}
                    {intent.id === activeIntent && <CommandShortcut>Tab</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showSuggest && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Repartir de zéro">
                  <CommandItem value="suggest" onSelect={() => run(onSuggest)}>
                    <Sparkles />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">Proposer une réponse complète</span>
                      {/* Dit avant le clic : c'est la seule commande de cette
                          palette qui jette ce qui est écrit. */}
                      <span className="block truncate text-xs text-muted-foreground">
                        Remplace le message, à partir du ticket
                      </span>
                    </span>
                    {modifier && <CommandShortcut>{modifier} O</CommandShortcut>}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>

        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Rien n&apos;est envoyé au client : le texte revient dans le champ, à relire.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Filtre maison plutôt que celui de `cmdk` (`shouldFilter={false}`) : l'ordre
 * des commandes est ici une information — la consigne libre d'abord, les
 * intentions ensuite — et un classement par score la ferait sauter d'une frappe
 * à l'autre. Les accents sont ignorés : personne ne tape « développer » avec son
 * accent quand il cherche vite.
 */
function matches(haystack: string, query: string) {
  const needle = fold(query);
  if (!needle) return true;
  return fold(haystack).includes(needle);
}

function fold(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
