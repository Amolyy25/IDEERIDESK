"use client";

import Image from "next/image";
import { ShieldAlert, ShieldQuestion } from "lucide-react";
import type { TicketAttachment } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Causes annoncées à l'agent = celles que le code produit vraiment : scanner injoignable
// au dépôt (upload-inspection.ts), CLAMAV_HOST absent (antivirus.ts), stock antérieur
// marqué par la migration.

// Horaire du cron Railway qui appelle POST /api/cron/antivirus. À changer ici si la
// planification bouge : c'est la seule chose que la modale promet à l'agent.
const RESCAN_SCHEDULE = "chaque nuit à 23 h";

// Hôte à déclarer dans `images.remotePatterns` (next.config.ts), sinon next/image refuse la source.
const VADER_IMAGE =
  "https://cdn.artphotolimited.com/images/6718bf5f258c849397f6133d/1000x1000/star-wars-darth-vader-the-sith-lord.jpg";

export function AttachmentScanDialog({
  attachment,
  children,
}: {
  attachment: TicketAttachment;
  children: React.ReactNode;
}) {
  const quarantined = attachment.scanStatus === "INFECTED";
  const Icon = quarantined ? ShieldAlert : ShieldQuestion;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              className={quarantined ? "size-4 text-destructive" : "size-4 text-amber-600"}
              aria-hidden
            />
            {quarantined ? "Fichier mis en quarantaine" : "Analyse en attente"}
          </DialogTitle>
          <DialogDescription>
            {quarantined
              ? "L'antivirus a reconnu une signature de logiciel malveillant dans ce fichier."
              : "L'antivirus n'a pas encore examiné ce fichier. Il est stocké et intact, c'est sa vérification qui manque."}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
          {attachment.filename}
        </p>

        {quarantined ? (
          <QuarantineBody signature={attachment.scanSignature} />
        ) : (
          <PendingBody />
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fermer</Button>
          </DialogClose>

          {!quarantined && (
            <Button asChild>
              <a
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Accéder quand même au fichier
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingBody() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <div>
        <p className="font-medium text-foreground">Pourquoi il est encore en attente</p>
        <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
          <li>
            Le scanner était injoignable au moment du dépôt : service redémarré, mise à jour des
            signatures, ou aucune réponse en 15 secondes. Un envoi n&apos;est jamais bloqué pour
            autant, un client doit pouvoir créer son ticket même quand l&apos;antivirus est en
            panne.
          </li>
        </ul>
      </div>

      <div>
        <p className="font-medium text-foreground">Quand pourrai-je accéder à ce fichier ?</p>
        <p className="mt-1.5">
          Une reprise automatique repasse {RESCAN_SCHEDULE} sur les fichiers en attente et met
          leur état à jour. Rien à déclencher : le verdict sera visible sur la fiche dès demain
          matin.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-muted/40">
        <div className="relative h-40 w-full">
          <Image
            src={VADER_IMAGE}
            alt="Dark Vador"
            fill
            sizes="(max-width: 640px) 100vw, 80px"
            className="object-cover object-top"
          />
        </div>
        <p className="border-t p-3">
          En attendant, ouvrez ce fichier seulement si la force est avec vous !
        </p>
      </div>
    </div>
  );
}

function QuarantineBody({ signature }: { signature: string | null }) {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          Son contenu a été supprimé du stockage dès la détection. Il ne reste que la trace du
          dépôt : nom, taille reçue, date et signature.
        </li>
        <li>
          Il ne peut donc être ni ouvert ni téléchargé, et personne ne peut le restaurer,
          administrateur compris.
        </li>
        <li>
          Si ce document est nécessaire au traitement du ticket, demandez au client de contrôler
          son poste puis de le renvoyer.
        </li>
      </ul>

      {signature && (
        <p className="rounded-lg border bg-muted/40 p-3">
          Signature détectée : <span className="font-mono text-xs">{signature}</span>
        </p>
      )}
    </div>
  );
}
