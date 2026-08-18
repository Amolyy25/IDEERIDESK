"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ARTICLE_PROSE_CLASS } from "@/lib/article-html";
import {
  ARTICLE_AUDIENCES,
  ARTICLE_FORMATS,
  ARTICLE_LENGTHS,
  ARTICLE_TODO_MARKER,
  ARTICLE_TONES,
  DEFAULT_ARTICLE_AUDIENCE,
  DEFAULT_ARTICLE_FORMAT,
  DEFAULT_ARTICLE_LENGTH,
  DEFAULT_ARTICLE_TONE,
  MAX_ARTICLE_INSTRUCTION_CHARS,
  MAX_ARTICLE_SUBJECT_CHARS,
  type ArticleAudienceId,
  type ArticleFormatId,
  type ArticleLengthId,
  type ArticleToneId,
} from "@/lib/ai-article";

export type GeneratedArticle = {
  title: string;
  excerpt: string;
  categoryId: string | null;
  categoryName: string | null;
  content: string;
};

/**
 * La rédaction assistée d'un article, en un seul écran.
 *
 * Le principe qui gouverne tout le reste : ON NE REMPLACE RIEN SANS AVOIR
 * MONTRÉ. Le résultat s'affiche à côté du brief, mis en forme comme il le sera
 * dans l'article, et rien ne touche au formulaire tant que l'agent n'a pas
 * cliqué « Insérer ». Une génération décevante ne coûte donc qu'un clic sur
 * « Régénérer », jamais un paragraphe déjà écrit.
 *
 * Le brief reste affiché à côté du résultat, et c'est ce qui rend l'aller-retour
 * praticable : on lit ce qui ne va pas, on ajoute une ligne dans « Consigne
 * libre », on relance. Un formulaire qui aurait disparu derrière le résultat
 * aurait forcé à tout retaper.
 */
export function ArticleAiDialog({
  onApply,
  sourceTicket,
}: {
  onApply: (result: GeneratedArticle) => void;
  /**
   * Ticket d'origine quand on arrive depuis « Créer un article » sur une fiche.
   * Seuls son numéro et son sujet sont ici : le fil reste côté serveur.
   */
  sourceTicket?: { id: string; number: number; subject: string } | null;
}) {
  // Ouvert d'emblée quand on vient d'un ticket : l'agent a déjà cliqué sur
  // « Créer un article », lui redemander de cliquer sur « Rédiger avec l'IA »
  // serait lui faire répéter la même intention.
  const [open, setOpen] = useState(Boolean(sourceTicket));
  /** Décochable : le ticket est une proposition, pas une contrainte. */
  const [useTicket, setUseTicket] = useState(Boolean(sourceTicket));

  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<ArticleFormatId>(DEFAULT_ARTICLE_FORMAT);
  const [audience, setAudience] = useState<ArticleAudienceId>(DEFAULT_ARTICLE_AUDIENCE);
  const [length, setLength] = useState<ArticleLengthId>(DEFAULT_ARTICLE_LENGTH);
  const [tone, setTone] = useState<ArticleToneId>(DEFAULT_ARTICLE_TONE);
  const [instruction, setInstruction] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<GeneratedArticle | null>(null);

  // Un article se compte en dizaines de secondes, pas en centaines de
  // millisecondes : un spinner seul laisse croire à un blocage passé dix
  // secondes. Le compteur ne sert qu'à ça — dire que ça avance.
  // La remise à zéro est faite au départ de la génération, pas ici : un effet
  // qui appelle `setState` dans son corps déclenche un rendu en cascade.
  useEffect(() => {
    if (!isGenerating) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const ticketSource = useTicket ? sourceTicket : null;
  // Sans ticket, le sujet est la seule matière : il devient obligatoire.
  const canGenerate = Boolean(ticketSource) || Boolean(subject.trim());

  async function generate() {
    if (!canGenerate || isGenerating) return;
    setElapsed(0);
    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/article", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          ticketId: ticketSource?.id,
          format,
          audience,
          length,
          tone,
          instruction: instruction.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Génération impossible");
      }
      setResult(body as GeneratedArticle);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Génération impossible");
    } finally {
      setIsGenerating(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply(result);
    setOpen(false);
  }

  // Le brief survit à la fermeture (on rouvre souvent pour régénérer autrement),
  // le résultat non : un brouillon d'hier affiché à l'ouverture serait pris pour
  // celui qu'on vient de demander.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setResult(null);
  }

  const todoCount = result ? result.content.split(ARTICLE_TODO_MARKER).length - 1 : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Sparkles className="size-4" />
          Rédiger avec l&apos;IA
        </Button>
      </DialogTrigger>

      {/*
        La hauteur est bornée et le défilement confié aux DEUX colonnes, pas à
        la page : un article détaillé fait deux écrans, et une modale qui grandit
        avec lui pousse « Insérer » hors de l'écran — le seul bouton qui compte
        devient alors le seul qu'on ne peut pas atteindre.
      */}
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Rédiger un article avec l&apos;IA</DialogTitle>
          <DialogDescription>
            Décrivez le sujet ou collez vos notes. Le brouillon s&apos;affiche à côté ; rien
            n&apos;est inséré dans l&apos;article avant que vous le demandiez.
          </DialogDescription>
        </DialogHeader>

        {/*
          En dessous de `lg`, une seule colonne : c'est le corps entier qui
          défile, et chaque colonne reprend sa hauteur naturelle.
        */}
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:overflow-visible">
          {/* Le brief */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {sourceTicket && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {ticketSource
                      ? `Source : ticket #${sourceTicket.number}`
                      : `Ticket #${sourceTicket.number} ignoré`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{sourceTicket.subject}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => setUseTicket((value) => !value)}
                >
                  {ticketSource ? "Ne pas utiliser" : "Réutiliser"}
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ai-subject">
                {ticketSource ? "Précisions à ajouter" : "Sujet de l'article"}
              </Label>
              <Textarea
                id="ai-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={MAX_ARTICLE_SUBJECT_CHARS}
                rows={ticketSource ? 4 : 7}
                autoFocus
                placeholder={
                  ticketSource
                    ? "Facultatif — le fil du ticket suffit. Ajoutez ici ce qu'il ne dit pas : la vraie cause, ce qu'il faut éviter."
                    : "Ex. : comment réinitialiser le mot de passe d'un utilisateur.\n\n" +
                      "Vos notes brutes conviennent aussi — plus vous en donnez, moins l'IA a à deviner."
                }
                // Le raccourci du champ long : la main est déjà sur le clavier
                // à la fin de la saisie, aller chercher le bouton à la souris
                // est le geste de trop.
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void generate();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                N&apos;y mettez pas de données personnelles (nom, email, téléphone d&apos;un
                client) : un article a vocation à être publié.
                {ticketSource && " Les notes internes du ticket ne sont pas transmises."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Trame</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ArticleFormatId)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_FORMATS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ARTICLE_FORMATS.find((f) => f.id === format)?.hint}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <SettingSelect
                label="Lecteur"
                value={audience}
                options={ARTICLE_AUDIENCES}
                onChange={(v) => setAudience(v as ArticleAudienceId)}
              />
              <SettingSelect
                label="Longueur"
                value={length}
                options={ARTICLE_LENGTHS}
                onChange={(v) => setLength(v as ArticleLengthId)}
              />
              <SettingSelect
                label="Ton"
                value={tone}
                options={ARTICLE_TONES}
                onChange={(v) => setTone(v as ArticleToneId)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-instruction">Consigne libre</Label>
              <Textarea
                id="ai-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={MAX_ARTICLE_INSTRUCTION_CHARS}
                rows={2}
                placeholder="Ex. : insiste sur le fait que la synchronisation peut prendre 24 h."
              />
              <p className="text-xs text-muted-foreground">
                Facultatif, et cumulable avec la trame. C&apos;est aussi ici qu&apos;on corrige
                une génération avant de la relancer.
              </p>
              </div>
            </div>

            {/* Hors de la zone qui défile : toujours à portée de clic. */}
            <Button
              type="button"
              onClick={generate}
              disabled={!canGenerate || isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rédaction en cours… {elapsed}s
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {result ? "Régénérer" : "Générer le brouillon"}
                </>
              )}
            </Button>
          </div>

          {/* Le résultat */}
          <div className="flex h-[420px] flex-col rounded-md border bg-muted/20 lg:h-auto lg:min-h-0">
            {!result && (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {isGenerating
                  ? "L'article s'écrit — comptez une vingtaine de secondes."
                  : "Le brouillon apparaîtra ici, mis en forme comme dans l'article."}
              </div>
            )}

            {result && (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <p className="text-base font-semibold">{result.title || "(sans titre)"}</p>
                  {result.excerpt && (
                    <p className="mt-1 text-xs text-muted-foreground">{result.excerpt}</p>
                  )}
                  {result.categoryName && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Catégorie proposée : {result.categoryName}
                    </p>
                  )}
                  <hr className="my-3" />
                  {/* Contenu déjà passé par `sanitizeRichHtml` côté serveur. */}
                  <div
                    className={ARTICLE_PROSE_CLASS}
                    dangerouslySetInnerHTML={{ __html: result.content }}
                  />
                </div>

                {todoCount > 0 && (
                  // Le compte est affiché plutôt que laissé à découvrir : ces
                  // marqueurs sont exactement les endroits où le modèle aurait
                  // inventé s'il n'avait pas eu la consigne de s'abstenir.
                  <div className="flex items-start gap-2 border-t bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {todoCount} information{todoCount > 1 ? "s" : ""} manquante
                      {todoCount > 1 ? "s" : ""} — cherchez «&nbsp;{ARTICLE_TODO_MARKER}&nbsp;»
                      dans le texte après insertion.
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t p-3">
                  <Button type="button" size="sm" onClick={apply}>
                    Insérer dans l&apos;article
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Les trois réglages courts : même gabarit, l'intitulé au-dessus.
 *
 * L'option ne porte QUE son libellé. Radix rend le contenu de l'option
 * sélectionnée à l'intérieur du déclencheur : une seconde ligne d'explication
 * dans l'option s'y retrouvait recopiée puis rognée en plein mot, sur trois
 * sélecteurs larges d'un tiers de colonne. L'explication passe donc sous le
 * champ, où elle a la place de s'écrire — et elle ne décrit que la valeur
 * choisie, ce qui est justement ce qu'on veut relire avant de générer.
 */
function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; hint: string }[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-snug text-muted-foreground">{selected?.hint}</p>
    </div>
  );
}
