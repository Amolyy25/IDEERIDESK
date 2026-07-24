"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAutomationRule, updateAutomationRule } from "@/lib/actions/automations";
import type { AutomationRuleWithStatuses } from "@/lib/actions/automations";
import type { TicketStatus } from "@/generated/prisma/client";

export function AutomationRuleDialog({
  rule,
  statuses,
  trigger,
}: {
  rule?: AutomationRuleWithStatuses;
  statuses: TicketStatus[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [triggerStatusId, setTriggerStatusId] = useState(rule?.triggerStatusId ?? statuses[0]?.id ?? "");
  const [actionStatusId, setActionStatusId] = useState(rule?.actionStatusId ?? statuses[0]?.id ?? "");
  const [addNote, setAddNote] = useState(rule?.addNote ?? true);
  const [sendEmail, setSendEmail] = useState(rule?.sendEmail ?? false);
  const isEditing = Boolean(rule);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    try {
      const input = {
        name: formData.get("name") as string,
        isActive: formData.get("isActive") === "on",
        delayDays: Number(formData.get("delayDays")),
        triggerStatusId,
        actionStatusId,
        addNote,
        noteContent: (formData.get("noteContent") as string) ?? "",
        sendEmail,
        emailContent: (formData.get("emailContent") as string) || null,
      };

      if (rule) {
        await updateAutomationRule(rule.id, input);
      } else {
        await createAutomationRule(input);
      }
      toast.success(isEditing ? "Automatisation mise à jour" : "Automatisation créée");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Modifier l'automatisation" : "Nouvelle automatisation"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              defaultValue={rule?.name}
              placeholder="Fermeture auto après attente client"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Si en statut</Label>
              <Select value={triggerStatusId} onValueChange={setTriggerStatusId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delayDays">Depuis plus de (jours)</Label>
              <Input
                id="delayDays"
                name="delayDays"
                type="number"
                min={1}
                max={365}
                required
                defaultValue={rule?.delayDays ?? 3}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Alors passer au statut</Label>
            <Select value={actionStatusId} onValueChange={setActionStatusId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="addNote"
                checked={addNote}
                onCheckedChange={(v) => setAddNote(v === true)}
              />
              <Label htmlFor="addNote" className="text-sm font-normal">
                Ajouter une note interne
              </Label>
            </div>
            {addNote && (
              <Textarea
                name="noteContent"
                rows={2}
                maxLength={2000}
                defaultValue={rule?.noteContent}
                placeholder="Ticket automatiquement fermé après inactivité."
              />
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(v === true)}
              />
              <Label htmlFor="sendEmail" className="text-sm font-normal">
                Envoyer un e-mail de clôture au client
              </Label>
            </div>
            {sendEmail && (
              <Textarea
                name="emailContent"
                rows={3}
                maxLength={5000}
                defaultValue={rule?.emailContent ?? ""}
                placeholder="Bonjour, nous n'avons pas eu de nouvelles de votre part, nous clôturons donc ce ticket…"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isActive" name="isActive" defaultChecked={rule?.isActive ?? true} />
            <Label htmlFor="isActive" className="text-sm font-normal text-muted-foreground">
              Automatisation active
            </Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
