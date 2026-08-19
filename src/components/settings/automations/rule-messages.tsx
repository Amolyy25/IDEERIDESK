"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { isReplyHtmlEmpty } from "@/lib/reply-html";
import { Field } from "@/components/settings/automations/automation-tokens";
import type { useAutomationRuleForm } from "@/components/settings/automations/use-automation-rule-form";

type Form = ReturnType<typeof useAutomationRuleForm>;
export type MessageTemplate = { id: string; title: string; body: string };

/**
 * Le message client, hors des colonnes Quand/Alors : un éditeur riche a besoin
 * de la pleine largeur. La note interne, elle, tient dans sa colonne.
 */
export function RuleMessages({ form, templates }: { form: Form; templates: MessageTemplate[] }) {
  // Modèle choisi alors que l'éditeur n'était pas vide : on demande avant
  // d'écraser un message déjà rédigé, que rien ne permettrait de retrouver.
  const [pending, setPending] = useState<MessageTemplate | null>(null);

  if (!form.sendEmail) return null;

  function pick(template: MessageTemplate) {
    if (isReplyHtmlEmpty(form.emailHtml)) {
      form.setEmailHtml(template.body);
      return;
    }
    setPending(template);
  }

  function confirmPending() {
    if (pending) form.setEmailHtml(pending.body);
    setPending(null);
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <Field label="Message au client">
        {templates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="mb-2">
                Partir d&apos;une réponse prédéfinie
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {templates.map((template) => (
                <DropdownMenuItem key={template.id} onSelect={() => pick(template)}>
                  {template.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <RichTextEditor
          value={form.emailHtml}
          onChange={form.setEmailHtml}
          minHeight="140px"
          placeholder="Bonjour, sans nouvelles de votre part, nous clôturons ce ticket…"
        />

        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          L&apos;en-tête et le pied de page de Paramètres&nbsp;&gt;&nbsp;Habillage des e-mails sont
          ajoutés à l&apos;envoi. N&apos;écrivez ici que le corps du message.
        </p>

        {form.emailError && <p className="text-xs text-destructive">{form.emailError}</p>}
      </Field>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer le message écrit ?</AlertDialogTitle>
            <AlertDialogDescription>
              «&nbsp;{pending?.title}&nbsp;» va prendre la place du message actuel, qui sera perdu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>Remplacer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
