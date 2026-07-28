"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImagePlus,
  Video,
  Image as ImageIcon,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VideoEmbed } from "@/components/editor/video-embed-extension";
import { StyleBlock } from "@/components/editor/style-block-extension";

export type InternalLinkTarget = { id: string; title: string; slug: string };

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "200px",
  logoUrl,
  internalLinkTargets,
  onUploadImage,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Si fourni, affiche un bouton dédié pour insérer ce logo dans le contenu. */
  logoUrl?: string | null;
  /** Si fourni, propose un lien vers un autre article de la base de connaissances. */
  internalLinkTargets?: InternalLinkTarget[];
  /** Si fourni, permet d'uploader une image (sinon le bouton image est masqué). */
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [htmlPopoverOpen, setHtmlPopoverOpen] = useState(false);
  const [rawHtml, setRawHtml] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      VideoEmbed,
      StyleBlock,
      Placeholder.configure({ placeholder: placeholder ?? "Écrivez…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose-content max-w-none text-sm leading-relaxed focus:outline-none " +
          "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 " +
          "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 " +
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 " +
          "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 " +
          "[&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
          "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md",
      },
    },
  });

  if (!editor) return null;

  // Un texte affiché personnalisable ("cliquer ici" plutôt que le titre de
  // l'article ou l'URL brute) : si une sélection existe et qu'aucun label
  // n'est saisi, on garde le comportement standard (transformer le texte
  // sélectionné en lien) ; sinon on insère le label comme nouveau texte lié —
  // ça remplace la sélection le cas échéant, donc "renommer" un lien existant
  // fonctionne aussi en resélectionnant puis en tapant un nouveau label.
  function applyLink() {
    const href = linkUrl.trim();
    if (!href) {
      editor!.chain().focus().unsetLink().run();
      setLinkUrl("");
      setLinkLabel("");
      setLinkPopoverOpen(false);
      return;
    }

    const { empty } = editor!.state.selection;
    const label = linkLabel.trim() || (empty ? href : "");

    if (label) {
      editor!
        .chain()
        .focus()
        .insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor!.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    setLinkUrl("");
    setLinkLabel("");
    setLinkPopoverOpen(false);
  }

  // Choisir un article ne l'insère plus directement : ça remplit les champs
  // (URL + un label suggéré = le titre de l'article) pour que l'agent puisse
  // encore changer le texte affiché avant de valider.
  function selectInternalTarget(target: InternalLinkTarget) {
    setLinkUrl(`/kb/${target.slug}`);
    if (!linkLabel.trim()) setLinkLabel(target.title);
  }

  function applyVideo() {
    if (videoUrl.trim()) {
      editor!.chain().focus().setVideoEmbed(videoUrl.trim()).run();
    }
    setVideoUrl("");
    setVideoPopoverOpen(false);
  }

  // Coller du HTML "rendu" (copié depuis une page web) est déjà géré nativement
  // par Tiptap — le presse-papier fournit alors du `text/html`. Ce bouton
  // couvre le cas différent où l'utilisateur colle le CODE SOURCE HTML en tant
  // que texte brut (ex: un email exporté) : `insertContent` avec une chaîne
  // la fait analyser comme balisage, pas comme texte littéral.
  //
  // Le CSS (balise `<style>`, attributs `style=`) est conservé : un article
  // doit pouvoir embarquer sa mise en forme. Le JS est retiré ici par confort
  // d'édition, mais la vraie barrière est `sanitizeRichHtml`, appliquée à
  // l'enregistrement ET au rendu — un filtrage fait uniquement ici se
  // contournerait en appelant l'action directement.
  function applyHtml() {
    const safeHtml = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
    if (safeHtml.trim()) {
      editor!.chain().focus().insertContent(safeHtml).run();
    }
    setRawHtml("");
    setHtmlPopoverOpen(false);
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadImage) return;
    setIsUploading(true);
    try {
      const url = await onUploadImage(file);
      editor!.chain().focus().setImage({ src: url }).run();
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1.5">
        <ToolbarButton
          title="Gras"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italique"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Titre 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Titre 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Liste à puces"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Liste numérotée"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Citation"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <span>
              <ToolbarButton
                title="Lien"
                active={editor.isActive("link")}
                onClick={() => {
                  const { from, to, empty } = editor.state.selection;
                  setLinkLabel(empty ? "" : editor.state.doc.textBetween(from, to, " "));
                  setLinkUrl(editor.getAttributes("link").href ?? "");
                  setLinkPopoverOpen(true);
                }}
              >
                <Link2 className="h-3.5 w-3.5" />
              </ToolbarButton>
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="start">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Texte affiché</p>
              <Input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Cliquez ici"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && applyLink()}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Lien externe</p>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && applyLink()}
              />
            </div>
            {internalLinkTargets && internalLinkTargets.length > 0 && (
              <div className="space-y-1.5 border-t pt-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Ou choisir un article
                </p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto">
                  {internalLinkTargets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => selectInternalTarget(target)}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted",
                        linkUrl === `/kb/${target.slug}` && "bg-muted"
                      )}
                    >
                      {target.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button type="button" size="sm" className="w-full" onClick={applyLink}>
              {linkUrl.trim() ? "Insérer le lien" : "Retirer le lien"}
            </Button>
          </PopoverContent>
        </Popover>

        {onUploadImage && (
          <>
            <ToolbarButton
              title="Insérer une image"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={handleFileSelected}
            />
          </>
        )}

        <Popover open={videoPopoverOpen} onOpenChange={setVideoPopoverOpen}>
          <PopoverTrigger asChild>
            <span>
              <ToolbarButton title="Insérer une vidéo (YouTube / Vimeo)" onClick={() => setVideoPopoverOpen(true)}>
                <Video className="h-3.5 w-3.5" />
              </ToolbarButton>
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Lien YouTube ou Vimeo
            </p>
            <div className="flex gap-1.5">
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && applyVideo()}
              />
              <Button type="button" size="sm" className="h-8" onClick={applyVideo}>
                OK
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarButton title="Coller du code HTML" onClick={() => setHtmlPopoverOpen(true)}>
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Dialog open={htmlPopoverOpen} onOpenChange={setHtmlPopoverOpen}>
          <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Coller du code HTML</DialogTitle>
            </DialogHeader>
            <Textarea
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder="<h2>Titre</h2><p>Texte…</p>"
              className="flex-1 resize-none overflow-y-auto font-mono text-xs"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" onClick={applyHtml}>
                Insérer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {logoUrl && (
          <ToolbarButton
            title="Insérer le logo"
            onClick={() => editor.chain().focus().setImage({ src: logoUrl }).run()}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
      </div>

      <div className="px-3 py-2" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
