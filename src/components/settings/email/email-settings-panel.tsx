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
import { Switch } from "@/components/ui/switch";
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
import {
  disconnectEmailAccount,
  updateInboundTicketCreation,
  updateSenderName,
} from "@/lib/actions/email-account";
import { formatDateTime } from "@/lib/format-date";

type EmailAccountStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  senderName: string;
  inboundCreatesTickets: boolean;
};

/**
 * Plus de distinction lecteur/administrateur ici : la section entière est
 * derrière la permission « settings.email » (voir le plan des réglages).
 * Quiconque affiche ce panneau peut agir dessus.
 */
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
  const [createsTickets, setCreatesTickets] = useState(status.inboundCreatesTickets);
  const [isSavingCreation, setIsSavingCreation] = useState(false);

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

  async function handleTicketCreationChange(enabled: boolean) {
    // Bascule optimiste : l'interrupteur suit le doigt tout de suite, et revient
    // à son état précédent si le serveur refuse.
    setCreatesTickets(enabled);
    setIsSavingCreation(true);
    try {
      await updateInboundTicketCreation(enabled);
      if (enabled) {
        toast.success("Les emails entrants créent désormais des tickets");
      } else {
        toast.success("Les emails sans ticket correspondant seront ignorés");
      }
      router.refresh();
    } catch (error) {
      setCreatesTickets(!enabled);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Impossible d'enregistrer ce réglage");
      }
    } finally {
      setIsSavingCreation(false);
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
          {`Affiché comme nom d'expéditeur dans les emails envoyés aux clients (ex. « ${senderName || "Ideeri Support"} »).`}
        </p>
      </div>

      {status.connected && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Synchronisation</h2>
            <p className="text-xs text-muted-foreground">
              Automatique, en arrière-plan pendant qu&apos;un agent a le tableau de bord
              ouvert. Une réponse à un ticket existant est toujours rattachée à son fil,
              qu&apos;elle arrive du tableau de bord, du widget ou du portail.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="inboundCreatesTickets">
                  Créer un ticket depuis un email entrant
                </Label>
                <p className="text-xs text-muted-foreground">
                  Un email reçu sur {status.email} qui ne répond à aucun ticket ouvre un
                  nouveau ticket. Désactivé, il est ignoré.
                </p>
              </div>
              <Switch
                id="inboundCreatesTickets"
                checked={createsTickets}
                onCheckedChange={handleTicketCreationChange}
                disabled={isSavingCreation}
              />
            </div>

            {createsTickets ? (
              <ul className="space-y-1 rounded-md border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Objet</span> de l&apos;email
                  → sujet du ticket ; <span className="font-medium text-foreground">corps</span>{" "}
                  → demande initiale, pièces jointes comprises.
                </li>
                <li>
                  <span className="font-medium text-foreground">Expéditeur</span> → client
                  rattaché au ticket (fiche créée s&apos;il est inconnu).
                </li>
                <li>
                  <span className="font-medium text-foreground">Destinataire, copie,
                  répondre à, date et objet d&apos;origine</span>{" "}
                  sont conservés sur la fiche du ticket, sous « Email d&apos;origine ».
                </li>
                <li>
                  Statut et priorité par défaut, aucun agent assigné. Le ticket remonte
                  comme activité non lue.
                </li>
                <li>
                  L&apos;
                  <Link href="/settings/acknowledgement" className="underline">
                    accusé de réception
                  </Link>{" "}
                  part en réponse à l&apos;email du client, dans son fil, avec le numéro du
                  ticket. Aucun modèle configuré = aucun envoi.
                </li>
                <li>
                  Réponses automatiques (« absent du bureau »), newsletters et listes de
                  diffusion restent ignorées, comme les emails envoyés depuis la boîte
                  elle-même.
                </li>
              </ul>
            ) : (
              <p className="rounded-md border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
                Seules les réponses à un ticket déjà créé sont prises en compte. Un email
                d&apos;un client connu sans ticket correspondant est signalé aux agents,
                mais reste à traiter dans la boîte support.
              </p>
            )}

          </div>
        </>
      )}
    </div>
  );
}
