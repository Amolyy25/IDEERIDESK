"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Users, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { uploadEmailImage } from "@/components/editor/upload-email-image";
import { HtmlPolicyHint } from "@/components/editor/html-policy-hint";
import { SignaturePreview } from "@/components/settings/signatures/signature-preview";
import { createEmailSignature, updateEmailSignature } from "@/lib/actions/signatures";
import type { EmailSignatureWithAgents } from "@/lib/actions/signatures";
import { DEFAULT_SIGNATURE_BODY_HTML, SIGNATURE_VARIABLES } from "@/lib/signature";
import type { SignatureScope } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Agent proposé dans la liste à cocher — réduit à ce que le formulaire affiche. */
export type SignatureAgentOption = { id: string; name: string };

export function SignatureDialog({
  signature,
  agents,
  logoUrl,
  trigger,
}: {
  signature?: EmailSignatureWithAgents;
  agents: SignatureAgentOption[];
  /** Logo insérable dans la signature, en chemin relatif. */
  logoUrl: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Le formulaire est un composant à part, monté avec la fenêtre : chaque
          ouverture repart donc de la signature enregistrée, sans état résiduel
          d'une édition abandonnée — l'éditeur riche, lui, ne relit pas sa
          valeur après son montage. */}
      <DialogContent className="sm:max-w-2xl">
        <SignatureForm
          signature={signature}
          agents={agents}
          logoUrl={logoUrl}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SignatureForm({
  signature,
  agents,
  logoUrl,
  onSaved,
}: {
  signature?: EmailSignatureWithAgents;
  agents: SignatureAgentOption[];
  logoUrl: string | null;
  onSaved: () => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(signature);

  const [name, setName] = useState(signature?.name ?? "");
  const [scope, setScope] = useState<SignatureScope>(signature?.scope ?? "ALL_AGENTS");
  const [agentIds, setAgentIds] = useState<string[]>(
    signature?.agents.map((agent) => agent.id) ?? []
  );
  const [bodyHtml, setBodyHtml] = useState(signature?.bodyHtml ?? DEFAULT_SIGNATURE_BODY_HTML);
  const [isActive, setIsActive] = useState(signature?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleAgent(agentId: string, checked: boolean) {
    if (checked) {
      setAgentIds((current) => [...current, agentId]);
    } else {
      setAgentIds((current) => current.filter((id) => id !== agentId));
    }
  }

  /**
   * Champs contrôlés et non `FormData` comme les autres fenêtres de réglages :
   * la portée décide de l'affichage de la liste d'agents, et l'aperçu suit la
   * frappe — ces valeurs doivent de toute façon vivre dans l'état du composant.
   */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const input = { name, scope, agentIds, bodyHtml, isActive };

      if (signature) {
        await updateEmailSignature(signature.id, input);
      } else {
        await createEmailSignature(input);
      }
      toast.success(isEditing ? "Signature mise à jour" : "Signature créée");
      onSaved();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Modifier la signature" : "Nouvelle signature"}</DialogTitle>
      </DialogHeader>

      {/* Le contenu défile, pas la fenêtre : l'éditeur, la liste d'agents et
          l'aperçu dépassent la hauteur d'un petit écran. */}
      <div className="max-h-[68dvh] space-y-4 overflow-y-auto px-1">
        <div className="space-y-2">
          <Label htmlFor="signature-name">Nom de la signature</Label>
          <Input
            id="signature-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            placeholder="Signature support"
          />
          <p className="text-xs text-muted-foreground">
            Nom interne : il sert à la retrouver dans cette liste, le client ne le voit jamais.
          </p>
        </div>

        <ScopeField
          scope={scope}
          onScopeChange={setScope}
          agents={agents}
          agentIds={agentIds}
          onToggleAgent={toggleAgent}
        />

        <div className="space-y-2">
          <Label>Contenu</Label>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder="Cordialement, {{prenom}} {{nom}}…"
            minHeight="140px"
            logoUrl={logoUrl}
            onUploadImage={uploadEmailImage}
          />
          <p className="text-xs text-muted-foreground">
            Images : sélectionnez-en une pour la redimensionner (poignée au coin bas-droit, ou
            tailles exactes au-dessus de l&apos;éditeur). PNG, JPEG, WEBP ou GIF, 1 Mo maximum.
          </p>
          <VariablesHint />
          <HtmlPolicyHint profile="email" />
        </div>

        <SignaturePreview bodyHtml={bodyHtml} />

        <div className="flex items-center gap-2">
          <Checkbox
            id="signature-active"
            checked={isActive}
            onCheckedChange={(value) => setIsActive(value === true)}
          />
          <Label htmlFor="signature-active" className="text-sm font-normal text-muted-foreground">
            Signature active — décochée, elle est conservée mais plus ajoutée aux emails.
          </Label>
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

/**
 * À qui s'applique la signature. Les deux portées sont deux boutons plutôt
 * qu'une liste déroulante : le choix décide de l'affichage de la liste d'agents
 * juste en dessous, il doit se lire sans être ouvert.
 */
function ScopeField({
  scope,
  onScopeChange,
  agents,
  agentIds,
  onToggleAgent,
}: {
  scope: SignatureScope;
  onScopeChange: (scope: SignatureScope) => void;
  agents: SignatureAgentOption[];
  agentIds: string[];
  onToggleAgent: (agentId: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Appliquée à</Label>

      <div className="grid gap-2 sm:grid-cols-2">
        <ScopeChoice
          selected={scope === "ALL_AGENTS"}
          onSelect={() => onScopeChange("ALL_AGENTS")}
          icon={<Users className="h-4 w-4" />}
          label="Toute l'équipe"
          hint="Tous les agents, sauf ceux qui ont leur propre signature."
        />
        <ScopeChoice
          selected={scope === "SPECIFIC_AGENTS"}
          onSelect={() => onScopeChange("SPECIFIC_AGENTS")}
          icon={<UserRound className="h-4 w-4" />}
          label="Agents choisis"
          hint="Uniquement les agents cochés ci-dessous."
        />
      </div>

      {scope === "SPECIFIC_AGENTS" && (
        <ScrollArea className="h-36 rounded-md border p-2">
          <div className="space-y-1.5">
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun agent disponible.</p>
            )}
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2">
                <Checkbox
                  id={`signature-agent-${agent.id}`}
                  checked={agentIds.includes(agent.id)}
                  onCheckedChange={(value) => onToggleAgent(agent.id, value === true)}
                />
                <Label
                  htmlFor={`signature-agent-${agent.id}`}
                  className="text-sm font-normal text-muted-foreground"
                >
                  {agent.name}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function ScopeChoice({
  selected,
  onSelect,
  icon,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
        selected && "border-primary bg-primary/5 hover:bg-primary/5"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/**
 * Variables disponibles, listées depuis la même source que le remplissage
 * (`SIGNATURE_VARIABLES`) : la documentation affichée ne peut pas décrire une
 * variable qui n'existe pas. Un clic copie le nom — l'éditeur riche ne se laisse
 * pas insérer du texte depuis l'extérieur.
 */
function VariablesHint() {
  async function copyVariable(name: string) {
    const placeholder = `{{${name}}}`;
    try {
      await navigator.clipboard.writeText(placeholder);
      toast.success(`${placeholder} copié`);
    } catch {
      toast.error("Copie impossible — sélectionnez le nom à la main.");
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      <p>
        Ces variables sont remplacées à l&apos;envoi par l&apos;identité de l&apos;agent qui
        répond. Cliquez pour copier.
      </p>
      <ul className="space-y-1">
        {SIGNATURE_VARIABLES.map((variable) => (
          <li key={variable.name} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => copyVariable(variable.name)}
              title="Copier"
              className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground transition-colors hover:bg-muted/70"
            >
              {`{{${variable.name}}}`}
              <Copy className="size-3.5" />
            </button>
            <span className="pt-0.5">{variable.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
