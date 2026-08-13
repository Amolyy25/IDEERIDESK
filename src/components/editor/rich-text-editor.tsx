"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
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
  Eye,
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
import { stripScriptTags } from "@/lib/strip-script-tags";
import { VideoEmbed } from "@/components/editor/video-embed-extension";
import { StyleBlock } from "@/components/editor/style-block-extension";
import { ResizableImage } from "@/components/editor/resizable-image-extension";
import { ImageDragSupport } from "@/components/editor/image-drag-support";
import { ImageSizeControls } from "@/components/editor/image-size-controls";
import { ToolbarButton } from "@/components/editor/toolbar-button";

export type InternalLinkTarget = { id: string; title: string; slug: string };

// Le schéma Tiptap ne connaît ni `div`, ni `table`, ni l'attribut `style` : un
// gabarit d'email collé dans l'éditeur visuel en ressort dépouillé (structure
// aplatie, styles inline perdus, sélecteurs du bloc `<style>` sans cible). Ce
// n'est pas rattrapable en ajoutant des extensions — ProseMirror normalise le
// document, il ne restitue pas un balisage arbitraire.
//
// La sortie est donc un mode « source HTML » qui ne passe jamais par
// ProseMirror : la chaîne saisie est celle transmise au parent, à l'octet près.
// Ce test décide quand ce mode est nécessaire — présence d'une balise de mise en
// page ou d'un document complet.
const LAYOUT_MARKUP = /<\s*(?:style|div|table|center|font|html|body)\b|<!doctype/i;

export function needsHtmlSource(html: string) {
  return LAYOUT_MARKUP.test(html);
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

  // Un gabarit déjà enregistré qui contient de la mise en page s'ouvre en mode
  // source : sans ça, le simple fait d'ouvrir la page puis d'enregistrer le
  // détruirait, l'éditeur visuel ayant rendu une version aplatie.
  const [mode, setMode] = useState<"visual" | "html">(() =>
    needsHtmlSource(value) ? "html" : "visual"
  );
  const [htmlSource, setHtmlSource] = useState(value);
  const [showPreview, setShowPreview] = useState(true);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      ResizableImage,
      ImageDragSupport,
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

  function updateHtmlSource(next: string) {
    setHtmlSource(next);
    onChange(next);
  }

  // L'éditeur visuel rend un document ProseMirror : y repasser une mise en page
  // (div, table, style inline) la perd définitivement. Le sens du basculement
  // décide donc du traitement — vers la source, on part du HTML de l'éditeur ;
  // vers le visuel, on prévient avant de laisser Tiptap réanalyser.
  function switchToHtml() {
    setHtmlSource(editor!.getHTML());
    setMode("html");
  }

  function switchToVisual() {
    if (
      needsHtmlSource(htmlSource) &&
      !window.confirm(
        "L'éditeur visuel ne sait pas représenter la mise en page HTML (div, tableaux, styles inline) : elle sera simplifiée et perdue. Continuer ?"
      )
    ) {
      return;
    }
    editor!.commands.setContent(htmlSource);
    setMode("visual");
    onChange(editor!.getHTML());
  }

  // Coller du HTML "rendu" (copié depuis une page web) est déjà géré nativement
  // par Tiptap — le presse-papier fournit alors du `text/html`. Ce bouton
  // couvre le cas différent où l'utilisateur colle le CODE SOURCE HTML en tant
  // que texte brut (ex: un email exporté).
  //
  // Un balisage de mise en page ne peut pas être inséré dans le document
  // ProseMirror sans être détruit : il bascule le champ en mode source, où la
  // chaîne est conservée telle quelle. Un fragment simple (titres, paragraphes,
  // liens) reste inséré à la position du curseur, comportement le plus utile.
  //
  // Le JS est retiré ici par confort d'édition, mais la vraie barrière est
  // `sanitizeRichHtml` / `sanitizeEmailHtml`, appliquée à l'enregistrement ET au
  // rendu — un filtrage fait uniquement ici se contournerait en appelant
  // l'action directement.
  function applyHtml() {
    const safeHtml = stripScriptTags(rawHtml);
    if (safeHtml.trim()) {
      if (needsHtmlSource(safeHtml)) {
        const base = mode === "html" ? htmlSource : editor!.getHTML();
        // Un document complet remplace le contenu : le concaténer produirait du
        // balisage imbriqué invalide.
        const isDocument = /<!doctype|<\s*html\b/i.test(safeHtml);
        updateHtmlSource(isDocument || !base.trim() ? safeHtml : `${base}\n${safeHtml}`);
        setMode("html");
      } else {
        editor!.chain().focus().insertContent(safeHtml).run();
      }
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
    } catch (error) {
      // Sans ce rattrapage, un refus du serveur (format, taille, droits) ne se
      // voyait nulle part : le bouton reprenait son état normal et rien ne
      // s'insérait, sans un mot d'explication.
      toast.error(error instanceof Error ? error.message : "Envoi de l'image impossible");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1.5">
        {mode === "visual" && (
          <>
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
            title="Titre 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Titre 2"
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
                  <Link2 className="size-4" />
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
                <ImagePlus className="size-4" />
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
                <Video className="size-4" />
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
          <Code2 className="size-4" />
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
            <ImageIcon className="size-4" />
          </ToolbarButton>
        )}
          </>
        )}

        {mode === "html" && (
          <ToolbarButton
            title={showPreview ? "Masquer l'aperçu" : "Afficher l'aperçu"}
            active={showPreview}
            onClick={() => setShowPreview((previous) => !previous)}
          >
            <Eye className="size-4" />
          </ToolbarButton>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => mode === "html" && switchToVisual()}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              mode === "visual"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Visuel
          </button>
          <button
            type="button"
            onClick={() => mode === "visual" && switchToHtml()}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              mode === "html"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Source HTML
          </button>
        </div>
      </div>

      {/* Réglages de taille sur une ligne à part, apparue seulement quand une
          image est sélectionnée : les glisser dans la barre d'outils la ferait
          se replier sur deux lignes à chaque clic sur une image. */}
      {mode === "visual" && editor.isActive("image") && <ImageSizeControls editor={editor} />}

      {mode === "visual" ? (
        <div className="px-3 py-2" style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div>
          <Textarea
            value={htmlSource}
            onChange={(e) => updateHtmlSource(e.target.value)}
            placeholder="<table><tr><td style=&quot;padding:24px&quot;>…</td></tr></table>"
            className="resize-y rounded-none border-0 font-mono text-xs focus-visible:ring-0"
            style={{ minHeight }}
            spellCheck={false}
          />
          {showPreview && (
            <div className="border-t">
              <p className="border-b bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                Aperçu — rendu isolé : le CSS du gabarit ne peut pas déborder sur
                l&apos;application.
              </p>
              {/* `sandbox` vide : ni script, ni accès au document parent. Le
                  contenu affiché ici n'est pas encore assaini (ça se fait à
                  l'enregistrement), l'isolation n'est donc pas cosmétique. */}
              <iframe
                title="Aperçu du contenu"
                sandbox=""
                srcDoc={htmlSource}
                className="h-96 w-full bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
