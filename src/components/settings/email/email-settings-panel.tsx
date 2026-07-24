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
import { formatDateTime } from "@/lib/format-date";

type EmailAccountStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  senderName: string;
};

export function EmailSettingsPanel({
  status,
  isAdmin,
  justConnected,
  oauthError,
}: {
  status: EmailAccountStatus;
  isAdmin: boolean;
  justConnected: boolean;
  oauthError: string | null;
}) {
  const router = useRouter();
  const [senderName, setSenderName] = useState(status.senderName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La déconnexion a échoué");
    } finally {
      setIsDisconnecting(false);
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
              {isAdmin && (
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
              )}
            </div>
          </div>
        ) : isAdmin ? (
          <div className="rounded-lg border p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Connectez la boîte email support pour transformer automatiquement les emails
              entrants en tickets et répondre aux clients directement par email.
            </p>
            <Button asChild size="sm">
              <Link href="/api/auth/gmail/start">Connecter Gmail</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Aucune boîte email connectée. Seul un administrateur peut connecter Gmail.
            </p>
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
          disabled={isSavingName || !isAdmin}
        />
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? `Affiché comme nom d'expéditeur dans les emails envoyés aux clients (ex. « ${senderName || "Ideeri Support"} »).`
            : "Réglage partagé par toute l'équipe — modifiable uniquement par un administrateur."}
        </p>
      </div>

      {status.connected && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Synchronisation</h2>
            <p className="text-xs text-muted-foreground">
              Automatique, en arrière-plan pendant qu&apos;un agent a le tableau de bord
              ouvert. Seules les réponses à un ticket déjà créé (depuis le tableau de bord
              ou le widget) sont prises en compte — un email sans rapport avec un ticket
              existant est ignoré, pas transformé en nouveau ticket.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
