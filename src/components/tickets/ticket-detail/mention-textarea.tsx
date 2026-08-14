"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn, initials } from "@/lib/utils";
import {
  matchMentionCandidates,
  readMentionDraft,
  type MentionableAgent,
} from "@/lib/mentions";

const MAX_SUGGESTIONS = 6;

/**
 * Zone de saisie d'une note interne, avec autocomplétion des mentions.
 *
 * Le nom complet de l'agent est inséré en clair dans le texte (« @Jean
 * Dupont ») : la note reste lisible telle quelle par email et le serveur
 * retrouve les agents cités en relisant ce même texte (voir `@/lib/mentions`),
 * sans jeton opaque à maintenir dans le contenu.
 */
export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  agents,
  placeholder,
  rows = 4,
  disabled,
  focusRef,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * ⌘/Ctrl + Entrée, le même raccourci que la réponse publique. Testé avant
   * l'autocomplétion des mentions : la touche Entrée seule y valide un nom, et
   * un agent qui envoie sa note pendant qu'une liste est ouverte ne veut pas
   * insérer un collègue de plus.
   */
  onSubmit?: () => void;
  agents: MentionableAgent[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Poignée pour rendre le curseur au champ depuis l'extérieur (voir `ReplyEditor`). */
  focusRef?: React.RefObject<(() => void) | null>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Position du curseur à replacer après une insertion — appliquée en effet,
  // le DOM n'est pas encore à jour au moment du clic sur une suggestion.
  const caretToRestore = useRef<number | null>(null);
  const [draft, setDraft] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = draft
    ? matchMentionCandidates(agents, draft.query).slice(0, MAX_SUGGESTIONS)
    : [];
  const isOpen = suggestions.length > 0;

  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      // Curseur en fin de texte : on revient au champ pour compléter ce qu'on a
      // écrit, pas pour reprendre au début.
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    };
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);

  useEffect(() => {
    const caret = caretToRestore.current;
    if (caret === null) return;
    caretToRestore.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, [value]);

  function refreshDraft(nextValue: string, caretIndex: number) {
    setDraft(readMentionDraft(nextValue, caretIndex));
    setActiveIndex(0);
  }

  function insertMention(agent: MentionableAgent) {
    if (!draft) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const mention = `@${agent.name.trim()} `;
    const nextValue = value.slice(0, draft.start) + mention + value.slice(caret);

    caretToRestore.current = draft.start + mention.length;
    setDraft(null);
    setActiveIndex(0);
    onChange(nextValue);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmit) {
      event.preventDefault();
      // La liste ouverte est refermée au passage : la note part, il ne doit pas
      // rester un menu suspendu au-dessus d'un champ vidé.
      setDraft(null);
      onSubmit();
      return;
    }

    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(null);
    }
  }

  return (
    <div className="relative">
      {isOpen && (
        // Ouverte vers le haut : la zone de réponse est en bas de la fiche, une
        // liste déroulante vers le bas sortirait de l'écran.
        <ul
          role="listbox"
          aria-label="Agents à mentionner"
          className="absolute bottom-full left-0 z-50 mb-1 w-72 max-w-full overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
        >
          {suggestions.map((agent, index) => (
            <li key={agent.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                // `onMouseDown` : `onClick` arriverait après le blur du
                // textarea, qui a déjà refermé la liste.
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(agent);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {initials(agent.name || agent.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{agent.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {agent.email}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          refreshDraft(event.target.value, event.target.selectionStart ?? 0);
        }}
        onKeyDown={handleKeyDown}
        onClick={(event) => {
          const target = event.currentTarget;
          refreshDraft(target.value, target.selectionStart ?? 0);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}
