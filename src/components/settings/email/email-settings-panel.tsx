"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { disconnectEmailAccount, updateSenderName } from "@/lib/actions/email-account";
import { triggerManualGmailSync } from "@/lib/actions/gmail-sync";
import { formatDateTime } from "@/lib/format-date";

type EmailAccountStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  senderName: string;
};

export function EmailSettingsPanel({
  status,
  justConnected,
  oauthError,
}: {
  status: EmailAccountStatus;
  justConnected: boolean;
  oauthError: string | null;
}) {
  const router = useRouter();
  const [senderName, setSenderName] = useState(status.senderName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (justConnected) {
      toast.success("Gmail connecté");
      router.replace("/settings/email");
    }
  }, [justConnected, router]);

  async function handleSenderNameBlur() {
    if (senderName === status.senderName) return;
    setIsSavingName(true);
    try {
      await updateSenderName(senderName);
      toast.success("Nom de l'expéditeur enregistré");
    } catch {
      toast.error("Impossible d'enregistrer");
      setSenderName(status.senderName);
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await disconnectEmailAccount();
      toast.success("Gmail déconnecté");
      router.refresh();
    } catch {
      toast.error("La déconnexion a échoué");
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await triggerManualGmailSync();
      if (!result.connected) {
        toast.error("Gmail n'est pas connecté");
      } else {
        toast.success(
          `Synchronisation terminée : ${result.created} ticket(s) créé(s), ${result.appended} message(s) ajouté(s)`
        );
      }
      router.refresh();
    } catch {
      toast.error("La synchronisation a échoué");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      {oauthError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
          {oauthError}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Connexion Gmail</h2>

        {status.connected ? (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-medium">{status.email}</p>
                <p className="text-xs text-muted-foreground">
                  Connecté le {status.connectedAt ? formatDateTime(status.connectedAt) : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Connecté</Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isDisconnecting}>
                    Déconnecter
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Déconnecter Gmail ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La réception et l&apos;envoi d&apos;emails seront interrompus jusqu&apos;à
                      une nouvelle connexion.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisconnect}>Déconnecter</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Connectez la boîte email support pour transformer automatiquement les emails
              entrants en tickets et répondre aux clients directement par email.
            </p>
            <Button asChild size="sm">
              <Link href="/api/auth/gmail/start">Connecter Gmail</Link>
            </Button>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="senderName">Nom de l&apos;expéditeur</Label>
        <Input
          id="senderName"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          onBlur={handleSenderNameBlur}
          disabled={isSavingName}
        />
        <p className="text-xs text-muted-foreground">
          Affiché comme nom d&apos;expéditeur dans les emails envoyés aux clients (ex. &laquo;{" "}
          {senderName || "Ideeri Support"} &raquo;).
        </p>
      </div>

      {status.connected && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Synchronisation</h2>
            <p className="text-xs text-muted-foreground">
              Les emails entrants sont récupérés par sondage périodique. Utilisez ce bouton
              pour forcer une vérification immédiate, ou programmez un appel régulier vers{" "}
              <code className="rounded bg-muted px-1 py-0.5">/api/gmail/sync</code> (avec le
              secret configuré côté serveur) pour une synchronisation automatique.
            </p>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? "Synchronisation…" : "Synchroniser maintenant"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
