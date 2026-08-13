"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToolbarButton } from "@/components/editor/toolbar-button";
import { cn } from "@/lib/utils";

/**
 * Éditeur de la zone de réponse d'un ticket.
 *
 * Volontairement plus pauvre que `RichTextEditor` (base de connaissances,
 * gabarits d'email), et ce n'est pas un raccourci de mise en œuvre : on écrit
 * ici un message à une personne, pas une page. Ce qui manque manque exprès —
 * pas d'images ni de vidéos (elles partiraient en pièce jointe ou en lien cassé
 * chez le destinataire), pas de mode source HTML, pas de tableaux : la moitié
 * des clients mail les rendrait autrement.
 *
 * Ce qui reste est ce qu'une réponse de support utilise vraiment : de l'emphase,
 * des listes pour une marche à suivre, des liens, une citation, un intertitre.
 * C'est aussi, exactement, ce que `sanitizeReplyHtml` accepte à l'enregistrement
 * — la barre d'outils ne propose rien qui serait retiré à l'envoi.
 */
export function ReplyEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus = false,
  minHeight = "150px",
}: {
  value: string;
  onChange: (html: string) => void;
  /**
   * ⌘/Ctrl + Entrée, comme dans un client mail. Branché dans l'éditeur et non
   * sur le conteneur : ProseMirror consomme l'événement avant qu'il ne remonte.
   */
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus,
    extensions: [
      StarterKit.configure({
        // Un seul niveau de titre : dans un email, deux hiérarchies d'intertitres
        // ne se distinguent plus, et un H1 ferait concurrence à l'objet.
        heading: { levels: [2] },
        // `openOnClick` laissé à faux : en rédaction, cliquer un lien doit y
        // placer le curseur, pas quitter la page en emportant le brouillon.
        link: { openOnClick: false, autolink: true },
        // Les blocs de code ne sont pas dans la barre d'outils, mais ` ``` `
        // reste tapable — et le rendu email les couvre.
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Écrire la réponse…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          "prose-content max-w-none text-sm leading-relaxed focus:outline-none",
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5",
          "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:mb-1 [&_a]:text-primary [&_a]:underline",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
          "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3"
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
  });

  // Le contenu est repris de l'extérieur — brouillon restauré, réponse type
  // insérée, suggestion IA, champ vidé après l'envoi. La comparaison au HTML
  // courant est ce qui rend l'effet sans effet pendant la frappe : sans elle,
  // chaque caractère tapé remonterait ici et replacerait le curseur à la fin.
  useEffect(() => {
    if (!editor || editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
        <ToolbarButton
          title="Gras"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italique"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Souligné"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Barré"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          title="Intertitre"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Liste à puces"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Liste numérotée"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Citation"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <LinkButton editor={editor} />
      </div>

      {/* La hauteur minimale est posée sur la zone cliquable, pas sur le
          document : un champ court n'oblige pas à viser la première ligne pour
          y placer le curseur. */}
      <div
        className="cursor-text px-3 py-2"
        style={{ minHeight }}
        onMouseDown={(event) => {
          // Uniquement les clics sur le rembourrage : sur le texte, laisser
          // ProseMirror placer le curseur là où on a cliqué.
          if (event.target === event.currentTarget) {
            event.preventDefault();
            editor.chain().focus("end").run();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Pose ou retire un lien.
 *
 * Deux champs plutôt qu'un, comme dans l'éditeur d'articles : « cliquez ici »
 * est plus lisible dans un email qu'une URL de suivi de trente caractères, et
 * sans champ de libellé un agent qui n'a rien sélectionné ne peut pas en écrire.
 */
function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  function apply() {
    const href = url.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
      close();
      return;
    }

    const { empty } = editor.state.selection;
    const text = label.trim() || (empty ? href : "");

    if (text) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    close();
  }

  function close() {
    setUrl("");
    setLabel("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ToolbarButton
            title="Lien"
            active={editor.isActive("link")}
            onClick={() => {
              const { from, to, empty } = editor.state.selection;
              setLabel(empty ? "" : editor.state.doc.textBetween(from, to, " "));
              setUrl(editor.getAttributes("link").href ?? "");
              setOpen(true);
            }}
          >
            <Link2 className="size-4" />
          </ToolbarButton>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Texte affiché</p>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Cliquez ici"
            className="h-8 text-sm"
            onKeyDown={(event) => event.key === "Enter" && apply()}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Adresse</p>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="h-8 text-sm"
            onKeyDown={(event) => event.key === "Enter" && apply()}
          />
        </div>
        <Button type="button" size="sm" className="w-full" onClick={apply}>
          {url.trim() ? "Insérer le lien" : "Retirer le lien"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
